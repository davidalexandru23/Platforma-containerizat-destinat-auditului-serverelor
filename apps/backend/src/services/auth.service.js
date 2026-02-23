import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { UnauthorizedError, ConflictError } from '../middleware/error.middleware.js';
import { log } from '../lib/logger.js';

async function register(data) {
    const { email, password, firstName, lastName, role: roleName } = data;

    // Verificare daca email exista
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        throw new ConflictError('Email deja inregistrat');
    }

    // Hash parola
    const passwordHash = await bcrypt.hash(password, 10);

    // Initializare roluri daca nu exista
    await seedDefaultRoles();

    // Preluare rol sau implicit VIEWER
    const requestedRoleName = ['ADMIN', 'AUDITOR', 'VIEWER'].includes(roleName) ? roleName : 'VIEWER';
    const userRole = await prisma.role.findUnique({
        where: { name: requestedRoleName },
    });

    if (!userRole) {
        throw new Error('Rol inexistent');
    }

    // Creare utilizator
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            firstName,
            lastName,
            roleId: userRole.id,
        },
        include: { role: true },
    });

    // Generare token-uri
    const tokens = await generateTokens(user.id, user.email, user.role.name);

    log.info(`User registered: ${email} (${user.role.name})`);

    return {
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role.name,
        },
        ...tokens,
    };
}

async function login(data) {
    const { email, password, rememberMe } = data;

    // Cautare utilizator
    const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true },
    });

    if (!user) {
        throw new UnauthorizedError('Credentiale invalide');
    }

    // Verificare parola
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
        throw new UnauthorizedError('Credentiale invalide');
    }

    // Generare token-uri
    const tokens = await generateTokens(user.id, user.email, user.role.name, rememberMe);

    log.info(`User login: ${email} (RememberMe: ${!!rememberMe})`);

    return {
        user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role.name,
        },
        ...tokens,
    };
}

async function refresh(refreshToken) {
    // Cautare token reimprospatare in baza de date
    const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: {
            user: {
                include: { role: true },
            },
        },
    });

    if (!storedToken) {
        throw new UnauthorizedError('Refresh token invalid');
    }

    // Verificare expirare
    if (new Date() > storedToken.expiresAt) {
        await prisma.refreshToken.delete({
            where: { id: storedToken.id },
        });
        throw new UnauthorizedError('Refresh token expirat');
    }

    // Stergere vechiul token de reimprospatare
    await prisma.refreshToken.delete({
        where: { id: storedToken.id },
    });

    // Generare token-uri noi
    const tokens = await generateTokens(
        storedToken.user.id,
        storedToken.user.email,
        storedToken.user.role.name
    );

    return {
        user: {
            id: storedToken.user.id,
            email: storedToken.user.email,
            firstName: storedToken.user.firstName,
            lastName: storedToken.user.lastName,
            role: storedToken.user.role.name,
        },
        ...tokens,
    };
}

async function logout(userId) {
    await prisma.refreshToken.deleteMany({
        where: { userId },
    });

    return { message: 'Logout reusit' };
}

async function generateTokens(userId, email, roleName, rememberMe = false) {
    const payload = { sub: userId, email, role: roleName };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '2h',
    });

    const refreshTokenValue = uuidv4();
    const expiryDuration = rememberMe ? '30d' : (process.env.JWT_REFRESH_EXPIRY || '7d');
    const expiresAt = calculateExpiry(expiryDuration);

    await prisma.refreshToken.create({
        data: {
            token: refreshTokenValue,
            userId,
            expiresAt,
        },
    });

    return {
        accessToken,
        refreshToken: refreshTokenValue,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '2h',
    };
}

function calculateExpiry(expiryString) {
    const now = new Date();
    const match = expiryString.match(/^(\d+)([smhd])$/);

    if (!match) {
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return new Date(now.getTime() + value * (multipliers[unit] || 86400000));
}

async function seedDefaultRoles() {
    const roles = [
        { name: 'ADMIN', description: 'Administrator cu acces complet', permissions: ['*'] },
        { name: 'AUDITOR', description: 'Poate rula audituri si genera rapoarte', permissions: ['view', 'runAudit', 'generateReport'] },
        { name: 'VIEWER', description: 'Poate vizualiza servere si rapoarte', permissions: ['view'] },
    ];

    for (const role of roles) {
        await prisma.role.upsert({
            where: { name: role.name },
            update: {},
            create: role,
        });
    }
}

export {
    register,
    login,
    refresh,
    logout,
    generateTokens,
    seedDefaultRoles,
};
