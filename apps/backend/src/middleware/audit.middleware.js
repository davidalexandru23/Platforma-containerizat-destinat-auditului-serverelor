const { prisma } = require('../lib/prisma');

// Middleware audit logging
const auditLog = (action, resource) => {
    return async (req, res, next) => {
        // Salveaza original send
        const originalSend = res.send;

        res.send = function (body) {
            // Log doar daca request a reusit
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
        // Nu loga date sensibile
        const sensitiveEndpoints = ['/auth/login', '/auth/register', '/auth/refresh'];
        const isSensitive = sensitiveEndpoints.some(ep => req.originalUrl.includes(ep));

        await prisma.auditLog.create({
            data: {
                userId: req.user?.id || null,
                action,
                resource,
                resourceId: req.params.id || req.params.serverId || null,
                oldValue: null,
                newValue: isSensitive ? null : req.body,
                ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent'] || null,
            },
        });
    } catch (error) {
        console.error('Audit log error:', error);
    }
}

module.exports = { auditLog };
