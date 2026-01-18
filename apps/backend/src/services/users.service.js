const { prisma } = require('../lib/prisma');
const { NotFoundError } = require('../middleware/error.middleware');

class UsersService {
    async findAll() {
        return prisma.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: { select: { id: true, name: true } },
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async create(userData) {
        const { email, password, name, roleId } = userData;
        const bcrypt = require('bcryptjs');

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            const { ConflictError } = require('../middleware/error.middleware');
            throw new ConflictError('Email deja inregistrat');
        }

        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (!role) {
            throw new NotFoundError('Rol invalid');
        }

        const passwordHash = await bcrypt.hash(password, 10);

        // Split name into first/last logic can be improved, roughly:
        const [firstName, ...lastNameParts] = (name || '').split(' ');
        const lastName = lastNameParts.join(' ');

        return prisma.user.create({
            data: {
                email,
                passwordHash,
                firstName,
                lastName,
                roleId
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: { select: { id: true, name: true } },
                createdAt: true
            }
        });
    }

    async findById(id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: { select: { id: true, name: true, permissions: true } },
                permissions: { select: { id: true, serverId: true, capabilities: true, expiresAt: true } },
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new NotFoundError('User nu exista');
        }

        return user;
    }

    async updateRole(userId, roleId) {
        const role = await prisma.role.findUnique({ where: { id: roleId } });

        if (!role) {
            throw new NotFoundError('Rol nu exista');
        }

        return prisma.user.update({
            where: { id: userId },
            data: { roleId },
            select: {
                id: true,
                email: true,
                role: { select: { id: true, name: true } },
            },
        });
    }

    async delete(id) {
        const user = await prisma.user.findUnique({ where: { id } });

        if (!user) {
            throw new NotFoundError('User nu exista');
        }

        await prisma.user.delete({ where: { id } });

        return { message: 'User sters cu succes' };
    }

    async getRoles() {
        return prisma.role.findMany({
            select: { id: true, name: true, description: true, permissions: true },
        });
    }

    async changePassword(userId, currentPassword, newPassword) {
        const bcrypt = require('bcryptjs');

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new NotFoundError('User nu exista');
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!isPasswordValid) {
            const { UnauthorizedError } = require('../middleware/error.middleware');
            throw new UnauthorizedError('Parola curenta incorecta');
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });

        return { message: 'Parola schimbata cu succes' };
    }
}

module.exports = new UsersService();
