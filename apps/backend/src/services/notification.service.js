// Serviciu de notificare centralizat pentru difuzari WebSocket
import { log } from '../lib/logger.js';

let io = null;

const setIO = (socketIO) => {
    io = socketIO;
};

// Tipuri notificare
const NotificationType = {
    AGENT_ENROLLED: 'agent:enrolled',
    AGENT_OFFLINE: 'agent:offline',
    AUDIT_COMPLETED: 'audit:completed',
    AUDIT_FAILED: 'audit:failed',
    TEMPLATE_PUBLISHED: 'template:published',
    EVIDENCE_APPROVED: 'evidence:approved',
    EVIDENCE_REJECTED: 'evidence:rejected',
    SERVER_ALERT: 'server:alert',
};

// Difuzare notificare catre toti utilizatorii conectati
function notify(data) {
    if (!io) {
        log.warn('Notification service: IO not initialized');
        return;
    }

    const notification = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: new Date().toISOString(),
        ...data,
    };

    io.of('/ws/notifications').emit('notify', notification);
    log.ws('/notifications', 'broadcast', `${data.type}: ${data.title}`);
}

// Difuzare actualizare status server
function broadcastServerStatus(serverId, status, lastSeen, riskLevel = null) {
    if (!io) return;

    io.of('/ws/servers').emit('servers:status', {
        serverId,
        status,
        lastSeen: lastSeen?.toISOString() || new Date().toISOString(),
        riskLevel,
    });
}

// Difuzare eveniment activitate
function broadcastActivity(actor, action, entity, entityId, details = null) {
    if (!io) return;

    io.of('/ws/activity').emit('activity:event', {
        actor,
        action,
        entity,
        entityId,
        details,
        timestamp: new Date().toISOString(),
    });
}

// Difuzare alerte server
function broadcastServerAlert(serverId, type, message, severity) {
    if (!io) return;

    io.of('/ws/live').to(`server:${serverId}`).emit('server:alerts', {
        serverId,
        type,
        message,
        severity,
        timestamp: new Date().toISOString(),
    });
}

// Difuzare heartbeat
function broadcastHeartbeat(serverId, agentVersion, latencyMs) {
    if (!io) return;

    io.of('/ws/live').to(`server:${serverId}`).emit('server:heartbeat', {
        serverId,
        lastSeen: new Date().toISOString(),
        agentVersion,
        latencyMs,
    });
}

// Difuzare schimbare status audit (pentru actualizare live in frontend)
function broadcastAuditStatus(auditRunId, status, serverId) {
    if (!io) return;

    io.of('/ws/audit').emit('audit:status', {
        auditRunId,
        status,
        serverId,
        timestamp: new Date().toISOString(),
    });
    log.ws('/audit', 'status', `${auditRunId.substring(0, 8)} -> ${status}`);
}

export {
    setIO,
    notify,
    broadcastServerStatus,
    broadcastActivity,
    broadcastServerAlert,
    broadcastHeartbeat,
    broadcastAuditStatus,
    NotificationType,
};
