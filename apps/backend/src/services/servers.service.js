import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ForbiddenError } from '../middleware/error.middleware.js';

async function findAll(userId, userRole) {
    // Admin vede tot
    if (userRole === 'ADMIN') {
        return prisma.server.findMany({
            include: {
                agentIdentity: { select: { version: true, lastSeen: true } },
                _count: { select: { auditRuns: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // Altii vad doar serverele cu permisiuni
    const permissions = await prisma.permission.findMany({
        where: {
            userId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { serverId: true },
    });

    const serverIds = permissions.map(p => p.serverId);

    return prisma.server.findMany({
        where: { id: { in: serverIds } },
        include: {
            agentIdentity: { select: { version: true, lastSeen: true } },
            _count: { select: { auditRuns: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
}

async function findById(id, userId, userRole) {
    const server = await prisma.server.findUnique({
        where: { id },
        include: {
            agentIdentity: true,
            _count: { select: { auditRuns: true, inventorySnapshots: true, metricSamples: true } },
        },
    });

    if (!server) {
        throw new NotFoundError('Server nu exista');
    }

    // Verificare acces
    if (userRole !== 'ADMIN') {
        const hasAccess = await checkAccess(userId, id);
        if (!hasAccess) {
            throw new ForbiddenError('Nu ai acces la acest server');
        }
    }

    return server;
}

async function create(data, userId) {
    const server = await prisma.server.create({
        data: {
            name: data.name,
            hostname: data.hostname,
            ipAddress: data.ipAddress,
            description: data.description,
        },
    });

    // Generare token inrolare
    const enrollToken = uuidv4();
    await prisma.agentIdentity.upsert({
        where: { serverId: server.id },
        create: { serverId: server.id, enrollToken },
        update: { enrollToken, agentToken: null },
    });

    // Daca avem userId (creator), ii dam permisiuni complete automat
    if (userId) {
        await prisma.permission.create({
            data: {
                userId,
                serverId: server.id,
                capabilities: ['VIEW', 'AUDIT', 'MANAGE'],
            },
        });
    }

    return { ...server, enrollmentToken: enrollToken };
}

async function update(id, data) {
    const server = await prisma.server.findUnique({ where: { id } });

    if (!server) {
        throw new NotFoundError('Server nu exista');
    }

    // Whitelist campuri permise - previne mass-assignment
    const { name, hostname, ipAddress, description } = data;

    return prisma.server.update({
        where: { id },
        data: { name, hostname, ipAddress, description },
    });
}

async function deleteServer(id) {
    const server = await prisma.server.findUnique({ where: { id } });

    if (!server) {
        throw new NotFoundError('Server nu exista');
    }

    await prisma.server.delete({ where: { id } });

    return { message: 'Server sters cu succes' };
}

async function generateEnrollToken(id) {
    const server = await prisma.server.findUnique({
        where: { id },
        include: { agentIdentity: true },
    });

    if (!server) {
        throw new NotFoundError('Server nu exista');
    }

    const enrollToken = uuidv4();

    await prisma.agentIdentity.upsert({
        where: { serverId: id },
        create: { serverId: id, enrollToken },
        update: { enrollToken, agentToken: null },
    });

    return {
        enrollToken,
        expiresIn: '24h',
        message: 'Foloseste acest token pentru a inrola agentul pe server',
    };
}

// Returnare token inrolare existent fara regenerare
async function getEnrollToken(id) {
    const server = await prisma.server.findUnique({
        where: { id },
        include: { agentIdentity: true },
    });

    if (!server) {
        throw new NotFoundError('Server nu exista');
    }

    return { enrollToken: server.agentIdentity?.enrollToken || null };
}

async function grantPermission(serverId, userId, capabilities, expiresAt) {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundError('Server nu exista');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User nu exista');

    return prisma.permission.upsert({
        where: { userId_serverId: { userId, serverId } },
        create: { userId, serverId, capabilities, expiresAt },
        update: { capabilities, expiresAt },
    });
}

async function revokePermission(serverId, userId) {
    await prisma.permission.deleteMany({ where: { userId, serverId } });
    return { message: 'Permisiune revocata' };
}

async function getPermissions(serverId) {
    return prisma.permission.findMany({
        where: { serverId },
        include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
    });
}

async function getLatestMetrics(serverId) {
    return prisma.metricSample.findFirst({
        where: { serverId },
        orderBy: { createdAt: 'desc' },
    });
}

async function getLatestInventory(serverId) {
    return prisma.inventorySnapshot.findFirst({
        where: { serverId },
        orderBy: { createdAt: 'desc' },
    });
}

async function checkAccess(userId, serverId) {
    const permission = await prisma.permission.findFirst({
        where: {
            userId,
            serverId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
    });
    return !!permission;
}

async function checkOfflineServers() {
    const threshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    const notificationService = await import('./notification.service.js');

    const offlineServers = await prisma.agentIdentity.findMany({
        where: {
            lastSeen: { lt: threshold },
            server: {
                status: { in: ['ONLINE', 'ENROLLED'] }
            }
        },
        include: { server: true }
    });

    let updatedCount = 0;
    for (const identity of offlineServers) {
        await prisma.server.update({
            where: { id: identity.serverId },
            data: { status: 'OFFLINE' }
        });
        updatedCount++;

        // Difuzare schimbare status
        notificationService.broadcastServerStatus(identity.serverId, 'OFFLINE', new Date(), identity.server.riskLevel);

        // Difuzare eveniment flux activitate
        notificationService.broadcastActivity(
            'System',
            'SERVER_OFFLINE',
            'Server',
            identity.server.hostname || 'Unknown'
        );
    }

    return updatedCount;
}

export {
    findAll,
    findById,
    create,
    update,
    deleteServer as delete,
    generateEnrollToken,
    getEnrollToken,
    grantPermission,
    revokePermission,
    getPermissions,
    getLatestMetrics,
    getLatestInventory,
    checkAccess,
    checkOfflineServers,
};
