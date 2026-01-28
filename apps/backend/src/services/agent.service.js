import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { UnauthorizedError, BadRequestError } from '../middleware/error.middleware.js';
import { log } from '../lib/logger.js';
import * as notificationService from './notification.service.js';
import EventEmitter from 'events';

// WebSocket - setat din main.js
let io = null;
const setIO = (socketIO) => { io = socketIO; };

// Praguri alerta
const ALERT_THRESHOLDS = {
    CPU_HIGH: 90,
    CPU_WARNING: 80,
    MEM_HIGH: 90,
    MEM_WARNING: 80,
    DISK_HIGH: 90,
    DISK_WARNING: 85,
};

// Cache pentru modul delta
const metricsCache = new Map();

// Cache pt comenzi ad-hoc (Test Check)
const adhocQueue = new Map(); // serverId -> [ { id, command, resolve, ... } ]
const adhocResults = new EventEmitter(); // Event bus internal

/**
 * Inrolare agent nou in platforma.
 * Procesul de inrolare schimba un `enrollToken` temporar cu un `agentToken` permanent.
 * Acesta stabileste identitatea criptografica a agentului.
 * 
 * @param {Object} data - Datele trimise de agent (token, osInfo, version)
 */
async function enroll(data) {
    const { enrollToken, version, osInfo } = data;

    // Cautare identitate agent cu token
    const agentIdentity = await prisma.agentIdentity.findUnique({
        where: { enrollToken },
        include: { server: true },
    });

    if (!agentIdentity) {
        throw new UnauthorizedError('Token enrollment invalid');
    }

    // Generare token permanent agent
    const agentToken = uuidv4();

    // actualizeaza agent identity
    await prisma.agentIdentity.update({
        where: { id: agentIdentity.id },
        data: {
            agentToken,
            enrollToken: null,
            version,
            osInfo,
            lastSeen: new Date(),
        },
    });

    // Actualizare status server
    await prisma.server.update({
        where: { id: agentIdentity.serverId },
        data: { status: 'ENROLLED' },
    });

    log.agent(agentIdentity.serverId, 'enrolled', agentIdentity.server.name);

    return {
        agentToken,
        serverId: agentIdentity.serverId,
        serverName: agentIdentity.server.name,
        message: 'Agent inrolat cu succes',
    };
}

/**
 * Procesare metrici primite de la agent.
 */
async function submitMetrics(serverId, data, agentToken, ipAddress) {
    const requestStart = Date.now();
    const agentIdentity = await verifyAgentToken(serverId, agentToken);

    // Salvare metrici
    const metricSample = await prisma.metricSample.create({
        data: {
            serverId,
            cpuPercent: data.cpuPercent,
            memUsedBytes: BigInt(data.memUsedBytes),
            memTotalBytes: BigInt(data.memTotalBytes),
            diskUsedBytes: BigInt(data.diskUsedBytes),
            diskTotalBytes: BigInt(data.diskTotalBytes),
            netInBytes: BigInt(data.netInBytes),
            netOutBytes: BigInt(data.netOutBytes),
            loadAvg1: data.loadAvg1,
            loadAvg5: data.loadAvg5,
            loadAvg15: data.loadAvg15,
            topProcesses: data.topProcesses,
            openPortsSummary: data.openPortsSummary,
        },
    });

    const now = new Date();

    // update lastSeen si status
    await prisma.agentIdentity.update({
        where: { serverId },
        data: { lastSeen: now },
    });

    // Curatare IP (eliminare prefix ::ffff:)
    const cleanIp = ipAddress ? ipAddress.replace(/^::ffff:/, '') : null;

    // Check previous status for activity feed
    const previousServer = await prisma.server.findUnique({
        where: { id: serverId },
        select: { status: true, hostname: true }
    });

    const server = await prisma.server.update({
        where: { id: serverId },
        data: {
            status: 'ONLINE',
            ...(cleanIp && { ipAddress: cleanIp })
        },
    });

    // Broadcast activity if server just came online
    if (previousServer && previousServer.status !== 'ONLINE') {
        notificationService.broadcastActivity(
            'System',
            'SERVER_ONLINE',
            'Server',
            previousServer.hostname || 'Unknown'
        );
    }

    // Calculate latency
    const latencyMs = Date.now() - requestStart;

    // === DIFUZARI WEBSOCKET ===
    if (io) {
        // 1. Heartbeat
        notificationService.broadcastHeartbeat(serverId, agentIdentity.version, latencyMs);

        // 2. Mod Delta: doar daca valorile s-au schimbat semnificativ
        const lastMetrics = metricsCache.get(serverId);
        const currentMetrics = {
            cpu: data.cpuPercent,
            mem: Math.round((data.memUsedBytes / data.memTotalBytes) * 100),
            disk: Math.round((data.diskUsedBytes / data.diskTotalBytes) * 100),
        };

        let deltaPayload = null;
        if (!lastMetrics ||
            Math.abs(lastMetrics.cpu - currentMetrics.cpu) > 1 ||
            Math.abs(lastMetrics.mem - currentMetrics.mem) > 1 ||
            Math.abs(lastMetrics.disk - currentMetrics.disk) > 1) {

            deltaPayload = {
                serverId,
                cpu: data.cpuPercent,
                mem: {
                    used: data.memUsedBytes,
                    total: data.memTotalBytes,
                    percent: currentMetrics.mem,
                },
                disk: {
                    used: data.diskUsedBytes,
                    total: data.diskTotalBytes,
                    percent: currentMetrics.disk,
                },
                net: {
                    in: data.netInBytes,
                    out: data.netOutBytes,
                },
                topProcs: data.topProcesses,
                deltaMode: !!lastMetrics,
                timestamp: metricSample.createdAt.toISOString(),
            };

            io.of('/ws/live').to(`server:${serverId}`).emit('server:metrics', deltaPayload);
            metricsCache.set(serverId, currentMetrics);
        }

        // 3. Alerts - check thresholds
        const alerts = [];
        if (data.cpuPercent >= ALERT_THRESHOLDS.CPU_HIGH) {
            alerts.push({ type: 'CPU_HIGH', message: `CPU la ${data.cpuPercent.toFixed(1)}%`, severity: 'critical' });
        } else if (data.cpuPercent >= ALERT_THRESHOLDS.CPU_WARNING) {
            alerts.push({ type: 'CPU_WARNING', message: `CPU la ${data.cpuPercent.toFixed(1)}%`, severity: 'warning' });
        }

        if (currentMetrics.mem >= ALERT_THRESHOLDS.MEM_HIGH) {
            alerts.push({ type: 'MEM_HIGH', message: `Memorie la ${currentMetrics.mem}%`, severity: 'critical' });
        } else if (currentMetrics.mem >= ALERT_THRESHOLDS.MEM_WARNING) {
            alerts.push({ type: 'MEM_WARNING', message: `Memorie la ${currentMetrics.mem}%`, severity: 'warning' });
        }

        if (currentMetrics.disk >= ALERT_THRESHOLDS.DISK_HIGH) {
            alerts.push({ type: 'DISK_HIGH', message: `Disk la ${currentMetrics.disk}%`, severity: 'critical' });
        } else if (currentMetrics.disk >= ALERT_THRESHOLDS.DISK_WARNING) {
            alerts.push({ type: 'DISK_WARNING', message: `Disk la ${currentMetrics.disk}%`, severity: 'warning' });
        }

        for (const alert of alerts) {
            notificationService.broadcastServerAlert(serverId, alert.type, alert.message, alert.severity);
        }

        // 4. Server status update (pentru lista de servere)
        notificationService.broadcastServerStatus(serverId, 'ONLINE', now, server.riskLevel);
    }

    log.agent(serverId, 'metrics', `CPU: ${data.cpuPercent?.toFixed(1)}% | Latency: ${latencyMs}ms`);
    return { message: 'Metrici salvate' };
}

async function submitInventory(serverId, data, agentToken) {
    await verifyAgentToken(serverId, agentToken);

    await prisma.inventorySnapshot.create({
        data: {
            serverId,
            osInfo: data.osInfo,
            packages: data.packages,
            services: data.services,
            ports: data.ports,
            processes: data.processes,
            sshConfig: data.sshConfig,
            sysctl: data.sysctl,
            firewall: data.firewall,
            users: data.users,
        },
    });

    await prisma.agentIdentity.update({
        where: { serverId },
        data: { lastSeen: new Date() },
    });

    log.agent(serverId, 'inventory', `${data.packages?.length || 0} packages`);
    return { message: 'Inventory salvat' };
}

/**
 * Procesare rezultate verificari trimise de agent.
 */
async function submitCheckResults(serverId, auditRunId, data, agentToken) {
    try {
        await verifyAgentToken(serverId, agentToken);

        // --- GESTIONARE REZULTATE AD-HOC ---
        if (auditRunId === 'ADHOC') {
            console.log(`Received ADHOC results from server ${serverId}`);
            for (const result of data.results) {
                adhocResults.emit(result.automatedCheckId, result);
            }
            return { message: 'Adhoc results processed' };
        }
        // -----------------------------

        // Verificam existenta auditului
        const auditRun = await prisma.auditRun.findUnique({
            where: { id: auditRunId },
            include: {
                templateVersion: {
                    include: {
                        controls: {
                            include: { automatedChecks: true }
                        }
                    }
                },
                checkResults: { select: { automatedCheckId: true } }
            }
        });

        if (!auditRun || auditRun.serverId !== serverId) {
            throw new BadRequestError('Audit run invalid');
        }

        const auditService = await import('./audit.service.js');

        // Procesam fiecare rezultat primit
        for (const result of data.results) {
            let status = result.status;
            if (status === 'SKIPPED') status = 'NA';

            try {
                await prisma.checkResult.upsert({
                    where: {
                        auditRunId_automatedCheckId: {
                            auditRunId,
                            automatedCheckId: result.automatedCheckId,
                        },
                    },
                    create: {
                        auditRunId,
                        automatedCheckId: result.automatedCheckId,
                        status: status,
                        output: result.output,
                        errorMessage: result.errorMessage,
                    },
                    update: {
                        status: status,
                        output: result.output,
                        errorMessage: result.errorMessage,
                    },
                });

                // Notificam frontend-ul de update
                if (io) {
                    io.of('/ws/audit').to(`audit:${auditRunId}`).emit('checkResult', {
                        auditRunId,
                        checkId: result.automatedCheckId,
                        status: status,
                        timestamp: new Date().toISOString(),
                    });
                }
            } catch (err) {
                console.error(`Error processing result for check ${result.automatedCheckId}:`, err.message);
            }
        }

        // Verificare daca auditul s-a incheiat
        try {
            const count = await prisma.checkResult.count({
                where: { auditRunId }
            });

            const totalAutomatedChecks = auditRun.templateVersion.controls
                .filter(c => !auditRun.excludedControlIds.includes(c.controlId))
                .reduce((sum, c) => sum + c.automatedChecks.length, 0);

            if (count >= totalAutomatedChecks) {
                console.log(`All checks completed for audit ${auditRunId}. Triggering completion.`);
                await auditService.completeAudit(auditRunId);
            } else {
                console.log(`Audit progress: ${count}/${totalAutomatedChecks} checks completed.`);
            }
        } catch (err) {
            console.error(`Failed to trigger completion for audit ${auditRunId}:`, err);
        }

        return { message: 'Rezultate salvate' };
    } catch (error) {
        console.error('Critical error in submitCheckResults:', error);
        throw error;
    }
}

async function getPendingAuditChecks(serverId, agentToken) {
    await verifyAgentToken(serverId, agentToken);

    const auditRuns = await prisma.auditRun.findMany({
        where: { serverId, status: 'RUNNING' },
        include: {
            templateVersion: {
                include: {
                    controls: {
                        include: { automatedChecks: true },
                    },
                },
            },
            checkResults: {
                select: { automatedCheckId: true }
            }
        },
    });

    // 1. Obtinere verificari din Rulari Audit DB
    const dbChecks = auditRuns.flatMap(run => {
        const excludedIds = run.excludedControlIds || [];
        const completedCheckIds = new Set(run.checkResults.map(cr => cr.automatedCheckId));

        console.log(`AuditRun ${run.id}: Found ${run.checkResults.length} completed checks in DB.`);

        return run.templateVersion.controls
            .filter(c => !excludedIds.includes(c.controlId))
            .flatMap(control =>
                control.automatedChecks
                    .filter(check => !completedCheckIds.has(check.id))
                    .map(check => ({
                        auditRunId: run.id,
                        automatedCheckId: check.id,
                        checkId: check.checkId,
                        title: check.title,
                        command: check.command,
                        script: check.script,
                        expectedResult: check.expectedResult,
                        checkType: check.checkType || 'COMMAND',
                        comparison: check.comparison,
                        parser: check.parser,
                        normalize: check.normalize,
                        onFailMessage: check.onFailMessage,
                        platformScope: check.platformScope
                    }))
            );
    });

    // 2. INJECTIE VERIFICARI AD-HOC
    const adhocChecks = adhocQueue.get(serverId) || [];
    const mappedAdhoc = adhocChecks.map(c => ({
        auditRunId: 'ADHOC',
        automatedCheckId: c.id,
        checkId: c.id,
        title: 'Adhoc Check',
        command: c.command,
        script: c.script,
        expectedResult: c.expectedResult,
        checkType: c.checkType || 'COMMAND',
        comparison: c.comparison,
        parser: c.parser,
        normalize: c.normalize,
        onFailMessage: c.onFailMessage,
        platformScope: c.platformScope
    }));

    if (mappedAdhoc.length > 0) {
        console.log(`Injecting ${mappedAdhoc.length} adhoc checks for server ${serverId}`);
        // Clear queue effectively "consuming" them
        adhocQueue.set(serverId, []);
    }

    return [...dbChecks, ...mappedAdhoc];
}

/**
 * Adaugare la coada comanda ad-hoc si asteptare rezultat
 */
async function runAdhocCheck(serverId, checkData) {
    return new Promise((resolve, reject) => {
        const checkId = uuidv4();

        // Timeout 30s
        const timeout = setTimeout(() => {
            adhocResults.removeAllListeners(checkId);
            reject(new Error('Timeout waiting for agent response'));
        }, 30000);

        // Listen for result
        adhocResults.once(checkId, (result) => {
            clearTimeout(timeout);
            resolve(result);
        });

        // Add to queue
        const queue = adhocQueue.get(serverId) || [];
        queue.push({
            id: checkId,
            ...checkData
        });
        adhocQueue.set(serverId, queue);

        console.log(`Queued adhoc check ${checkId} for server ${serverId}`);
    });
}

async function verifyAgentToken(serverId, agentToken) {
    if (!agentToken) {
        throw new UnauthorizedError('Agent token lipsa');
    }

    const agentIdentity = await prisma.agentIdentity.findFirst({
        where: { serverId, agentToken },
    });

    if (!agentIdentity) {
        throw new UnauthorizedError('Agent token invalid');
    }

    return agentIdentity;
}

export {
    setIO,
    enroll,
    submitMetrics,
    submitInventory,
    submitCheckResults,
    getPendingAuditChecks,
    runAdhocCheck,
    verifyAgentToken,
};
