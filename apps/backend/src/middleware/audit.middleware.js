import { prisma } from '../lib/prisma.js';
import * as notificationService from '../services/notification.service.js';

// Middleware logare audit
const auditLog = (action, resource) => {
    return async (req, res, next) => {
        // Salvare send original
        const originalSend = res.send;

        res.send = function (body) {
            // Logare doar daca request-ul a reusit
            if (res.statusCode >= 200 && res.statusCode < 400) {
                logAction(req, action, resource).catch(console.error);
            }
            return originalSend.call(this, body);
        };

        next();
    };
};

async function logAction(req, action, resource) {
    try {
        // Excludere logare date sensibile
        const sensitiveEndpoints = ['/auth/login', '/auth/register', '/auth/refresh', '/users'];
        const isSensitive = sensitiveEndpoints.some(ep => req.originalUrl.includes(ep));
        const resourceId = req.params.id || req.params.serverId || null;

        await prisma.auditLog.create({
            data: {
                userId: req.user?.id || null,
                action,
                resource,
                resourceId: resourceId,
                oldValue: null,
                newValue: isSensitive ? null : req.body,
                ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent'] || null,
            },
        });

        // Difuzare catre flux activitate
        notificationService.broadcastActivity(
            req.user?.role?.name || 'SYSTEM',
            action,
            resource,
            resourceId,
            isSensitive ? null : req.body
        );

    } catch (error) {
        console.error('Audit log error:', error);
    }
}

export { auditLog };
