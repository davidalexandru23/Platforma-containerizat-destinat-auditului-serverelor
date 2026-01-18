const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { NotFoundError, ForbiddenError } = require('../middleware/error.middleware');

class ServersService {
    async findAll(userId, userRole) {
        // admin vede tot
        if (userRole === 'ADMIN') {
            return prisma.server.findMany({
                include: {
                    agentIdentity: { select: { version: true, lastSeen: true } },
                    _count: { select: { auditRuns: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        }

        // altii vad doar serverele cu permisiuni
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

    async findById(id, userId, userRole) {
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

        // check acces
        if (userRole !== 'ADMIN') {
            const hasAccess = await this.checkAccess(userId, id);
            if (!hasAccess) {
                throw new ForbiddenError('Nu ai acces la acest server');
            }
        }

        return server;
    }

    async create(data) {
        const server = await prisma.server.create({
            data: {
                name: data.name,
                hostname: data.hostname,
                ipAddress: data.ipAddress,
                description: data.description,
            },
        });

        // genereaza enrollment token
        const enrollToken = uuidv4();
        await prisma.agentIdentity.upsert({
            where: { serverId: server.id },
            create: { serverId: server.id, enrollToken },
            update: { enrollToken, agentToken: null },
        });

        return { ...server, enrollmentToken: enrollToken };
    }

    async update(id, data) {
        const server = await prisma.server.findUnique({ where: { id } });

        if (!server) {
            throw new NotFoundError('Server nu exista');
        }

        return prisma.server.update({
            where: { id },
            data,
        });
    }

    async delete(id) {
        const server = await prisma.server.findUnique({ where: { id } });

        if (!server) {
            throw new NotFoundError('Server nu exista');
        }

        await prisma.server.delete({ where: { id } });

        return { message: 'Server sters cu succes' };
    }

    async generateEnrollToken(id) {
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

    async grantPermission(serverId, userId, capabilities, expiresAt) {
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

    async revokePermission(serverId, userId) {
        await prisma.permission.deleteMany({ where: { userId, serverId } });
        return { message: 'Permisiune revocata' };
    }

    async getPermissions(serverId) {
        return prisma.permission.findMany({
            where: { serverId },
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });
    }

    async getLatestMetrics(serverId) {
        return prisma.metricSample.findFirst({
            where: { serverId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getLatestInventory(serverId) {
        return prisma.inventorySnapshot.findFirst({
            where: { serverId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async checkAccess(userId, serverId) {
        const permission = await prisma.permission.findFirst({
            where: {
                userId,
                serverId,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
        });
        return !!permission;
    }
}

module.exports = new ServersService();
