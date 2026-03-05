// Serviciu listener SNMP Trap UDP
// Primeste trap-uri SNMPv2c de la agenti si le retransmite live via WebSocket

import snmp from 'net-snmp';
import { log } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import * as notificationService from './notification.service.js';

// Referinta WebSocket (setata din main.js)
let io = null;

// OID-uri enterprise private BitTrail
const OID_BASE = '1.3.6.1.4.1.99999';
const OID_MAP = {
    [`${OID_BASE}.1`]: 'cpuPercent',       // Gauge32 x100
    [`${OID_BASE}.2`]: 'memUsedBytes',     // OctetString
    [`${OID_BASE}.3`]: 'memTotalBytes',    // OctetString
    [`${OID_BASE}.4`]: 'diskUsedBytes',    // OctetString
    [`${OID_BASE}.5`]: 'diskTotalBytes',   // OctetString
    [`${OID_BASE}.6`]: 'netInBytes',       // OctetString
    [`${OID_BASE}.7`]: 'netOutBytes',      // OctetString
    [`${OID_BASE}.8`]: 'loadAvg1',         // OctetString
    [`${OID_BASE}.9`]: 'loadAvg5',         // OctetString
    [`${OID_BASE}.10`]: 'loadAvg15',       // OctetString
    [`${OID_BASE}.11`]: 'serverId',        // OctetString
    [`${OID_BASE}.12`]: 'detailedJSON',    // OctetString (JSON blob)
    [`${OID_BASE}.13`]: 'timestamp',       // OctetString (ISO8601)
};

// Praguri alerta (sincronizate cu agent.service.js)
const ALERT_THRESHOLDS = {
    CPU_HIGH: 90,
    CPU_WARNING: 80,
    MEM_HIGH: 90,
    MEM_WARNING: 80,
    DISK_HIGH: 90,
    DISK_WARNING: 85,
};

/**
 * Initializare listener SNMP Trap
 * @param {object} socketIO - Instanta Socket.IO
 */
function startSNMPListener(socketIO) {
    io = socketIO;

    const port = parseInt(process.env.SNMP_TRAP_PORT) || 11162;
    const community = process.env.SNMP_COMMUNITY || 'bittrail';

    // Optiuni receiver trap
    const options = {
        port: port,
        disableAuthorization: false,
        accessControlModelType: snmp.AccessControlModelType.Simple,
        transportOptions: {
            type: 'udp4',
        },
    };

    try {
        const receiver = snmp.createReceiver(options, function (error, notification) {
            if (error) {
                log.error(`[SNMP] Eroare receiver: ${error.message}`);
                return;
            }

            // Procesare trap primit
            handleTrap(notification);
        });

        // Configurare autorizare community
        receiver.getAuthorizer().addCommunity(community);

        log.success(`SNMP Trap listener pornit pe port UDP ${port} (community: ${community})`);
    } catch (error) {
        log.error(`[SNMP] Eroare pornire listener: ${error.message}`);
        log.warn('[SNMP] Listener dezactivat. Metrici doar prin HTTP.');
    }
}

/**
 * Procesare trap SNMP primit de la agent
 */
async function handleTrap(notification) {
    try {
        const pdu = notification.pdu;

        // Extragere varbinds in obiect
        const data = {};
        for (const varbind of pdu.varbinds) {
            const fieldName = OID_MAP[varbind.oid];
            if (fieldName) {
                data[fieldName] = varbind.value?.toString() || '';
            }
        }

        // Validare camp obligatoriu - serverID
        if (!data.serverId) {
            log.warn('[SNMP] Trap fara serverId, ignorat');
            return;
        }

        const serverId = data.serverId;

        // Verificare server valid in baza de date
        const server = await prisma.server.findUnique({
            where: { id: serverId },
            select: { id: true, status: true, hostname: true, name: true },
        });

        if (!server) {
            log.warn(`[SNMP] Server necunoscut: ${serverId.substring(0, 8)}`);
            return;
        }

        // Decodare metrici agregate
        const cpuPercent = data.cpuPercent ? parseInt(data.cpuPercent) / 100 : 0; // x100 la trimitere
        const memUsedBytes = parseInt(data.memUsedBytes) || 0;
        const memTotalBytes = parseInt(data.memTotalBytes) || 1;
        const diskUsedBytes = parseInt(data.diskUsedBytes) || 0;
        const diskTotalBytes = parseInt(data.diskTotalBytes) || 1;
        const netInBytes = parseInt(data.netInBytes) || 0;
        const netOutBytes = parseInt(data.netOutBytes) || 0;
        const loadAvg1 = parseFloat(data.loadAvg1) || 0;
        const loadAvg5 = parseFloat(data.loadAvg5) || 0;
        const loadAvg15 = parseFloat(data.loadAvg15) || 0;

        // Decodare metrici detaliate (JSON blob)
        let detailed = null;
        if (data.detailedJSON) {
            try {
                detailed = JSON.parse(data.detailedJSON);
            } catch (e) {
                log.warn(`[SNMP] Eroare parsare JSON detaliat: ${e.message}`);
            }
        }

        const memPercent = Math.round((memUsedBytes / memTotalBytes) * 100);
        const diskPercent = Math.round((diskUsedBytes / diskTotalBytes) * 100);
        const timestamp = data.timestamp || new Date().toISOString();

        // === Difuzare WebSocket live ===
        if (io) {
            // 1. Metrici agregate (compatibilitate cu frontend-ul existent)
            io.of('/ws/live').to(`server:${serverId}`).emit('server:metrics', {
                serverId,
                cpu: cpuPercent,
                mem: { used: memUsedBytes, total: memTotalBytes, percent: memPercent },
                disk: { used: diskUsedBytes, total: diskTotalBytes, percent: diskPercent },
                net: { in: netInBytes, out: netOutBytes },
                load: { avg1: loadAvg1, avg5: loadAvg5, avg15: loadAvg15 },
                topProcs: detailed?.topProcessesDetailed?.map(p => p.name) || [],
                timestamp,
                source: 'snmp', // Indicator sursa (SNMP vs HTTP)
            });

            // 2. Metrici detaliate (eveniment nou pentru frontend extins)
            if (detailed) {
                io.of('/ws/live').to(`server:${serverId}`).emit('server:metrics:detailed', {
                    serverId,
                    cpuPercent,
                    cpuPerCore: detailed.cpuPerCore || [],
                    cpuCount: detailed.cpuCount || 0,
                    mem: {
                        used: memUsedBytes,
                        total: memTotalBytes,
                        available: detailed.memAvailableBytes || 0,
                        cached: detailed.memCachedBytes || 0,
                        buffers: detailed.memBuffersBytes || 0,
                        percent: memPercent,
                    },
                    swap: {
                        used: detailed.swapUsedBytes || 0,
                        total: detailed.swapTotalBytes || 0,
                        percent: detailed.swapTotalBytes
                            ? Math.round((detailed.swapUsedBytes / detailed.swapTotalBytes) * 100)
                            : 0,
                    },
                    disks: detailed.disks || [],
                    netInterfaces: detailed.netInterfaces || [],
                    net: { in: netInBytes, out: netOutBytes },
                    load: { avg1: loadAvg1, avg5: loadAvg5, avg15: loadAvg15 },
                    topProcesses: detailed.topProcessesDetailed || [],
                    timestamp,
                    source: 'snmp',
                });
            }

            // 3. Heartbeat (semnalizare online)
            notificationService.broadcastHeartbeat(serverId, null, 0);

            // 4. Status server (lista de servere)
            notificationService.broadcastServerStatus(serverId, 'ONLINE', new Date());

            // 5. Verificare praguri alerta
            const alerts = [];
            if (cpuPercent >= ALERT_THRESHOLDS.CPU_HIGH) {
                alerts.push({ type: 'CPU_HIGH', message: `CPU la ${cpuPercent.toFixed(1)}%`, severity: 'critical' });
            } else if (cpuPercent >= ALERT_THRESHOLDS.CPU_WARNING) {
                alerts.push({ type: 'CPU_WARNING', message: `CPU la ${cpuPercent.toFixed(1)}%`, severity: 'warning' });
            }

            if (memPercent >= ALERT_THRESHOLDS.MEM_HIGH) {
                alerts.push({ type: 'MEM_HIGH', message: `Memorie la ${memPercent}%`, severity: 'critical' });
            } else if (memPercent >= ALERT_THRESHOLDS.MEM_WARNING) {
                alerts.push({ type: 'MEM_WARNING', message: `Memorie la ${memPercent}%`, severity: 'warning' });
            }

            if (diskPercent >= ALERT_THRESHOLDS.DISK_HIGH) {
                alerts.push({ type: 'DISK_HIGH', message: `Disk la ${diskPercent}%`, severity: 'critical' });
            } else if (diskPercent >= ALERT_THRESHOLDS.DISK_WARNING) {
                alerts.push({ type: 'DISK_WARNING', message: `Disk la ${diskPercent}%`, severity: 'warning' });
            }

            for (const alert of alerts) {
                notificationService.broadcastServerAlert(serverId, alert.type, alert.message, alert.severity);
            }
        }

        // Actualizare lastSeen si status (non-blocant)
        prisma.agentIdentity.update({
            where: { serverId },
            data: { lastSeen: new Date() },
        }).catch(() => { /* ignorare silentioasa */ });

        // Actualizare status server daca nu era ONLINE
        if (server.status !== 'ONLINE') {
            prisma.server.update({
                where: { id: serverId },
                data: { status: 'ONLINE' },
            }).catch(() => { });

            notificationService.broadcastActivity(
                'System',
                'SERVER_ONLINE',
                'Server',
                server.hostname || 'Unknown'
            );
        }

        log.agent(serverId, 'snmp-trap', `CPU: ${cpuPercent.toFixed(1)}%`);
    } catch (error) {
        log.error(`[SNMP] Eroare procesare trap: ${error.message}`);
    }
}

export { startSNMPListener };
