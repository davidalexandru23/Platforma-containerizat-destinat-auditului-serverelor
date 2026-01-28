import express from 'express';
import * as authService from '../services/auth.service.js';
import { authLimiter } from '../middleware/rate-limit.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Inregistrare utilizator nou
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 */
router.post('/register',
    authLimiter,
    [
        body('email').isEmail().withMessage('Email invalid'),
        body('password').isLength({ min: 8 }).withMessage('Parola trebuie sa aiba minim 8 caractere'),
        body('firstName').optional().isString(),
        body('lastName').optional().isString(),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const result = await authService.register(req.body);
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Autentificare utilizator
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 */
router.post('/login',
    authLimiter,
    [
        body('email').isEmail().withMessage('Email invalid'),
        body('password').notEmpty().withMessage('Parola obligatorie'),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const result = await authService.login(req.body);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Reimprospatare token acces
 */
router.post('/refresh',
    authLimiter,
    [
        body('refreshToken').notEmpty().withMessage('Token reimprospatare obligatoriu'),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const result = await authService.refresh(req.body.refreshToken);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Deconectare utilizator
 *     security: [{ bearerAuth: [] }]
 */
router.post('/logout',
    authenticate,
    async (req, res, next) => {
        try {
            const result = await authService.logout(req.user.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
