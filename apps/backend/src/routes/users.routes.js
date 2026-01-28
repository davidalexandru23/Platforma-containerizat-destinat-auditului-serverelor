import express from 'express';
import * as usersService from '../services/users.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Lista toti utilizatorii (doar admin)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const users = await usersService.findAll();
            res.json(users);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Creare utilizator nou (doar admin)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const { email, password, name, roleId } = req.body;
            if (!email || !password || !name || !roleId) {
                return res.status(400).json({ message: 'Toate campurile sunt obligatorii' });
            }
            if (password.length < 6) {
                return res.status(400).json({ message: 'Parola trebuie sa aiba minim 6 caractere' });
            }

            const newUser = await usersService.create(req.body);
            res.status(201).json(newUser);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /users/roles:
 *   get:
 *     tags: [Users]
 *     summary: Lista roluri disponibile
 *     security: [{ bearerAuth: [] }]
 */
router.get('/roles',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const roles = await usersService.getRoles();
            res.json(roles);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Detalii utilizator
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const user = await usersService.findById(req.params.id);
            res.json(user);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Schimbare rol utilizator
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/role',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const result = await usersService.updateRole(req.params.id, req.body.roleId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Stergere utilizator
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const result = await usersService.delete(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /users/me/password:
 *   post:
 *     tags: [Users]
 *     summary: Schimbare parola utilizator autentificat
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 */
router.post('/me/password',
    authenticate,
    async (req, res, next) => {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ message: 'Parola curenta si noua sunt obligatorii' });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ message: 'Parola noua trebuie sa aiba minim 8 caractere' });
            }

            const result = await usersService.changePassword(req.user.id, currentPassword, newPassword);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
