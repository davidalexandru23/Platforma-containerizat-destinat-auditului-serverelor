const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { UnauthorizedError, ConflictError } = require('../middleware/error.middleware');
const { log } = require('../lib/logger');

class AuthService {
    async register(data) {
        const { email, password, firstName, lastName, role: roleName } = data;

        // check daca email exista
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new ConflictError('Email deja inregistrat');
        }

        // hash parola
        const passwordHash = await bcrypt.hash(password, 10);

        // seed roluri daca nu exista
        await this.seedDefaultRoles();

        // ia rolul sau default VIEWER
        const requestedRoleName = ['ADMIN', 'AUDITOR', 'VIEWER'].includes(roleName) ? roleName : 'VIEWER';
        const userRole = await prisma.role.findUnique({
            where: { name: requestedRoleName },
        });

        if (!userRole) {
            throw new Error('Rol inexistent');
        }

        // creeaza user
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

        // genereaza tokens
        const tokens = await this.generateTokens(user.id, user.email, user.role.name);

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

    async login(data) {
        const { email, password } = data;

        // cauta user
        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true },
        });

        if (!user) {
            throw new UnauthorizedError('Credentiale invalide');
        }

        // check parola
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedError('Credentiale invalide');
        }

        // genereaza tokens
        const tokens = await this.generateTokens(user.id, user.email, user.role.name);

        log.info(`User login: ${email}`);

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

    async refresh(refreshToken) {
        // cauta refresh token in db
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

        // check expirare
        if (new Date() > storedToken.expiresAt) {
            await prisma.refreshToken.delete({
                where: { id: storedToken.id },
            });
            throw new UnauthorizedError('Refresh token expirat');
        }

        // sterge vechiul refresh token
        await prisma.refreshToken.delete({
            where: { id: storedToken.id },
        });

        // genereaza tokens noi
        const tokens = await this.generateTokens(
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

    async logout(userId) {
        await prisma.refreshToken.deleteMany({
            where: { userId },
        });

        return { message: 'Logout reusit' };
    }

    async generateTokens(userId, email, roleName) {
        const payload = { sub: userId, email, role: roleName };

        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        });

        const refreshToken = uuidv4();
        const expiresAt = this.calculateExpiry(process.env.JWT_REFRESH_EXPIRY || '7d');

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId,
                expiresAt,
            },
        });

        return {
            accessToken,
            refreshToken,
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        };
    }

    calculateExpiry(expiryString) {
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

    async seedDefaultRoles() {
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
}

module.exports = new AuthService();
