const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma');
const { UnauthorizedError, ForbiddenError } = require('./error.middleware');

// middleware auth JWT
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Token lipsa');
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // cauta user in db
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub },
            include: { role: true },
        });

        if (!user) {
            throw new UnauthorizedError('User nu exista');
        }

        req.user = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(new UnauthorizedError('Token invalid sau expirat'));
        }
        next(error);
    }
};

// middleware verificare roluri
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new UnauthorizedError('Neautentificat'));
        }

        if (!roles.includes(req.user.role.name)) {
            return next(new ForbiddenError('Nu ai permisiunea necesara'));
        }

        next();
    };
};

// middleware check permisiuni pe server
const checkServerPermission = (capability) => {
    return async (req, res, next) => {
        try {
            const { serverId } = req.params;
            const userId = req.user.id;
            const roleName = req.user.role.name;

            // admin are acces la tot
            if (roleName === 'ADMIN') {
                return next();
            }

            // check permisiune specifica
            const permission = await prisma.permission.findFirst({
                where: {
                    userId,
                    serverId,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
            });

            if (!permission || !permission.capabilities.includes(capability)) {
                return next(new ForbiddenError(`Nu ai permisiunea ${capability} pentru acest server`));
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = {
    authenticate,
    authorize,
    checkServerPermission,
};
