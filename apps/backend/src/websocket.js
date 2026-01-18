const jwt = require('jsonwebtoken');
const agentService = require('./services/agent.service');
const auditService = require('./services/audit.service');
const { log } = require('./lib/logger');

function setupWebSocket(io) {
    // seteaza io in servicii
    agentService.setIO(io);
    auditService.setIO(io);

    // namespace pt live metrics
    const liveNamespace = io.of('/ws/live');

    liveNamespace.use((socket, next) => {
        const token = socket.handshake.query.token ||
            socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            log.ws('/live', 'auth-error', 'Token lipsa');
            return next(new Error('Token lipsa'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.data.userId = decoded.sub;
            socket.data.role = decoded.role;
            next();
        } catch (error) {
            log.ws('/live', 'auth-error', 'Token invalid');
            next(new Error('Token invalid'));
        }
    });

    liveNamespace.on('connection', (socket) => {
        log.ws('/live', 'connect', socket.id.substring(0, 8));

        socket.on('subscribe', (data) => {
            const { serverId } = data;
            socket.join(`server:${serverId}`);
            log.ws('/live', 'subscribe', `server:${serverId?.substring(0, 8)}`);
            socket.emit('subscribed', { serverId });
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

    // namespace pt audit progress
    const auditNamespace = io.of('/ws/audit');

    auditNamespace.use((socket, next) => {
        const token = socket.handshake.query.token ||
            socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            log.ws('/audit', 'auth-error', 'Token lipsa');
            return next(new Error('Token lipsa'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.data.userId = decoded.sub;
            socket.data.role = decoded.role;
            next();
        } catch (error) {
            log.ws('/audit', 'auth-error', 'Token invalid');
            next(new Error('Token invalid'));
        }
    });

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

    log.success('WebSocket namespaces: /ws/live, /ws/audit');
}

module.exports = { setupWebSocket };
