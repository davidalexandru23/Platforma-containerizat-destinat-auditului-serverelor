const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { UnauthorizedError, BadRequestError } = require('../middleware/error.middleware');
const { log } = require('../lib/logger');

// websocket - setat din main.js
let io = null;
const setIO = (socketIO) => { io = socketIO; };

class AgentService {
    async enroll(data) {
        const { enrollToken, version, osInfo } = data;

        // cauta agent identity cu token
        const agentIdentity = await prisma.agentIdentity.findUnique({
            where: { enrollToken },
            include: { server: true },
        });

        if (!agentIdentity) {
            throw new UnauthorizedError('Token enrollment invalid');
        }

        // genereaza agent token permanent
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

        // actualizeaza status server
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

    async submitMetrics(serverId, data, agentToken, ipAddress) {
        await this.verifyAgentToken(serverId, agentToken);

        // salveaza metrici
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

        // update lastSeen si status
        await prisma.agentIdentity.update({
            where: { serverId },
            data: { lastSeen: new Date() },
        });

        // curata IP (remove ::ffff: prefix)
        const cleanIp = ipAddress ? ipAddress.replace(/^::ffff:/, '') : null;

        await prisma.server.update({
            where: { id: serverId },
            data: {
                status: 'ONLINE',
                ...(cleanIp && { ipAddress: cleanIp })
            },
        });

        // broadcast prin websocket
        if (io) {
            io.of('/ws/live').to(`server:${serverId}`).emit('metrics', {
                serverId,
                ...data,
                timestamp: metricSample.createdAt.toISOString(),
            });
        }

        log.agent(serverId, 'metrics', `CPU: ${data.cpuPercent?.toFixed(1)}%`);
        return { message: 'Metrici salvate' };
    }

    async submitInventory(serverId, data, agentToken) {
        await this.verifyAgentToken(serverId, agentToken);

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

    async submitCheckResults(serverId, auditRunId, data, agentToken) {
        await this.verifyAgentToken(serverId, agentToken);

        // Verifica audit run
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

        const auditService = require('./audit.service');

        // Salveaza rezultatele
        for (const result of data.results) {
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
                    status: result.status,
                    output: result.output,
                    errorMessage: result.errorMessage,
                },
                update: {
                    status: result.status,
                    output: result.output,
                    errorMessage: result.errorMessage,
                },
            });

            // Broadcast result
            if (io) {
                io.of('/ws/audit').to(`audit:${auditRunId}`).emit('checkResult', {
                    auditRunId,
                    checkId: result.automatedCheckId,
                    status: result.status,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        log.agent(serverId, 'audit-results', `${data.results?.length || 0} checks`);

        // Check for completion
        // Re-fetch completed checks count including the ones just saved
        const count = await prisma.checkResult.count({
            where: { auditRunId }
        });

        const totalAutomatedChecks = auditRun.templateVersion.controls
            .filter(c => !auditRun.excludedControlIds.includes(c.controlId))
            .reduce((sum, c) => sum + c.automatedChecks.length, 0);

        if (count >= totalAutomatedChecks) {
            await auditService.completeAudit(auditRunId);
        }

        return { message: 'Rezultate salvate' };
    }

    async getPendingAuditChecks(serverId, agentToken) {
        await this.verifyAgentToken(serverId, agentToken);

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

        const pendingChecks = auditRuns.flatMap(run => {
            const excludedIds = run.excludedControlIds || [];
            const completedCheckIds = new Set(run.checkResults.map(cr => cr.automatedCheckId));

            console.log(`[DEBUG] AuditRun ${run.id}: Found ${run.checkResults.length} completed checks in DB.`);

            const checksToRun = run.templateVersion.controls
                .filter(c => !excludedIds.includes(c.controlId))
                .flatMap(control =>
                    control.automatedChecks
                        .filter(check => {
                            const isCompleted = completedCheckIds.has(check.id);
                            if (!isCompleted) {
                                // console.log(`[DEBUG] Check ${check.id} (${check.checkId}) is PENDING`);
                            }
                            return !isCompleted;
                        })
                        .map(check => ({
                            auditRunId: run.id,
                            automatedCheckId: check.id,
                            checkId: check.checkId,
                            title: check.title,
                            command: check.command,
                            script: check.script,
                            expectedResult: check.expectedResult,
                            checkType: check.checkType,
                        }))
                );

            console.log(`[DEBUG] AuditRun ${run.id}: Returning ${checksToRun.length} pending checks.`);
            return checksToRun;
        });

        return pendingChecks;
    }

    async verifyAgentToken(serverId, agentToken) {
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
}

const agentService = new AgentService();
module.exports = agentService;
module.exports.setIO = setIO;
