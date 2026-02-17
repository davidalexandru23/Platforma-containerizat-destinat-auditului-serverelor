import jwt from 'jsonwebtoken';
import * as agentService from './services/agent.service.js';
import * as auditService from './services/audit.service.js';
import * as notificationService from './services/notification.service.js';
import * as serversService from './services/servers.service.js';
import { log } from './lib/logger.js';

// Variabila globala pentru io
let io = null;

// Middleware autentificare JWT pentru WebSocket
const jwtAuth = (namespace) => (socket, next) => {
    const token = socket.handshake.query.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        log.ws(namespace, 'auth-error', 'Token lipsa');
        return next(new Error('Token lipsa'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = decoded.sub;
        socket.data.role = decoded.role;
        next();
    } catch (error) {
        log.ws(namespace, 'auth-error', 'Token invalid');
        next(new Error('Token invalid'));
    }
};

function setupWebSocket(ioInstance) {
    io = ioInstance;

    // Setare io in servicii
    agentService.setIO(io);
    auditService.setIO(io);
    notificationService.setIO(io);

    // ========================================
    // NAMESPACE: /ws/live - Metrici Live per Server
    // ========================================
    const liveNamespace = io.of('/ws/live');
    liveNamespace.use(jwtAuth('/live'));

    liveNamespace.on('connection', (socket) => {
        log.ws('/live', 'connect', socket.id.substring(0, 8));

        socket.on('server:subscribe', async (data) => {
            const { serverId } = data;
            // Verificare permisiuni acces server
            if (socket.data.role !== 'ADMIN') {
                const hasAccess = await serversService.checkAccess(socket.data.userId, serverId);
                if (!hasAccess) {
                    socket.emit('error', { message: 'Nu ai acces la acest server' });
                    return;
                }
            }
            socket.join(`server:${serverId}`);
            log.ws('/live', 'subscribe', `server:${serverId?.substring(0, 8)}`);
            socket.emit('subscribed', { serverId });
        });

        // Suport mostenire (legacy)
        socket.on('subscribe', async (data) => {
            const { serverId } = data;
            if (socket.data.role !== 'ADMIN') {
                const hasAccess = await serversService.checkAccess(socket.data.userId, serverId);
                if (!hasAccess) {
                    socket.emit('error', { message: 'Nu ai acces la acest server' });
                    return;
                }
            }
            socket.join(`server:${serverId}`);
            log.ws('/live', 'subscribe', `server:${serverId?.substring(0, 8)}`);
            socket.emit('subscribed', { serverId });
        });

        socket.on('server:unsubscribe', (data) => {
            const { serverId } = data;
            socket.leave(`server:${serverId}`);
            log.ws('/live', 'unsubscribe', `server:${serverId?.substring(0, 8)}`);
        });

        socket.on('unsubscribe', (data) => {
            const { serverId } = data;
            socket.leave(`server:${serverId}`);
            log.ws('/live', 'unsubscribe', `server:${serverId?.substring(0, 8)}`);
        });

        socket.on('disconnect', () => {
            log.ws('/live', 'disconnect', socket.id.substring(0, 8));
        });
    });

    // ========================================
    // NAMESPACE: /ws/audit - Progres Audit
    // ========================================
    const auditNamespace = io.of('/ws/audit');
    auditNamespace.use(jwtAuth('/audit'));

    auditNamespace.on('connection', (socket) => {
        log.ws('/audit', 'connect', socket.id.substring(0, 8));

        socket.on('subscribe', (data) => {
            const { auditRunId } = data;
            socket.join(`audit:${auditRunId}`);
            log.ws('/audit', 'subscribe', `audit:${auditRunId?.substring(0, 8)}`);
            socket.emit('subscribed', { auditRunId });
        });

        socket.on('unsubscribe', (data) => {
            const { auditRunId } = data;
            socket.leave(`audit:${auditRunId}`);
            log.ws('/audit', 'unsubscribe', `audit:${auditRunId?.substring(0, 8)}`);
        });

        socket.on('disconnect', () => {
            log.ws('/audit', 'disconnect', socket.id.substring(0, 8));
        });
    });

    // ========================================
    // NAMESPACE: /ws/notifications - Notificari Globale
    // ========================================
    const notificationsNamespace = io.of('/ws/notifications');
    notificationsNamespace.use(jwtAuth('/notifications'));

    notificationsNamespace.on('connection', (socket) => {
        log.ws('/notifications', 'connect', socket.id.substring(0, 8));

        // Alaturare utilizator la camera personala
        socket.join(`user:${socket.data.userId}`);

        socket.on('disconnect', () => {
            log.ws('/notifications', 'disconnect', socket.id.substring(0, 8));
        });
    });

    // ========================================
    // NAMESPACE: /ws/servers - Status Lista Servere
    // ========================================
    const serversNamespace = io.of('/ws/servers');
    serversNamespace.use(jwtAuth('/servers'));

    serversNamespace.on('connection', (socket) => {
        log.ws('/servers', 'connect', socket.id.substring(0, 8));

        socket.on('servers:subscribe', () => {
            socket.join('servers:all');
            log.ws('/servers', 'subscribe', 'all');
            socket.emit('subscribed', { scope: 'all' });
        });

        socket.on('disconnect', () => {
            log.ws('/servers', 'disconnect', socket.id.substring(0, 8));
        });
    });

    // ========================================
    // NAMESPACE: /ws/activity - Flux Activitate Live
    // ========================================
    const activityNamespace = io.of('/ws/activity');
    activityNamespace.use(jwtAuth('/activity'));

    activityNamespace.on('connection', (socket) => {
        log.ws('/activity', 'connect', socket.id.substring(0, 8));

        socket.on('activity:subscribe', () => {
            socket.join('activity:all');
            log.ws('/activity', 'subscribe', 'all');
            socket.emit('subscribed', { scope: 'all' });
        });

        socket.on('disconnect', () => {
            log.ws('/activity', 'disconnect', socket.id.substring(0, 8));
        });
    });

    log.success('WebSocket namespaces: /ws/live, /ws/audit, /ws/notifications, /ws/servers, /ws/activity');
}

export { setupWebSocket, io };
