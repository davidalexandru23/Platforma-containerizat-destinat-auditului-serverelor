import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError, UnauthorizedError } from '../middleware/error.middleware.js';

async function findAll() {
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

async function create(userData) {
    const { email, password, name, roleId } = userData;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new ConflictError('Email deja inregistrat');
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
        throw new NotFoundError('Rol invalid');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Logica impartire nume in prenume/nume poate fi imbunatatita, aproximativ:
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

async function findById(id) {
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

async function updateRole(userId, roleId) {
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

async function deleteUser(id) {
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
        throw new NotFoundError('User nu exista');
    }

    await prisma.user.delete({ where: { id } });

    return { message: 'User sters cu succes' };
}

async function getRoles() {
    return prisma.role.findMany({
        select: { id: true, name: true, description: true, permissions: true },
    });
}

async function changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
        throw new NotFoundError('User nu exista');
    }

    // Verificare parola curenta
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isPasswordValid) {
        throw new UnauthorizedError('Parola curenta incorecta');
    }

    // Hash parola noua
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
    });

    return { message: 'Parola schimbata cu succes' };
}

export {
    findAll,
    create,
    findById,
    updateRole,
    deleteUser as delete,
    getRoles,
    changePassword,
};
