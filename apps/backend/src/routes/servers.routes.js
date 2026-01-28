import express from 'express';
import * as serversService from '../services/servers.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { auditLog } from '../middleware/audit.middleware.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @swagger
 * /servers:
 *   get:
 *     tags: [Servers]
 *     summary: Lista servere (filtrate dupa permisiuni)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/',
    authenticate,
    async (req, res, next) => {
        try {
            const servers = await serversService.findAll(req.user.id, req.user.role.name);
            res.json(servers);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}:
 *   get:
 *     tags: [Servers]
 *     summary: Detalii server
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id',
    authenticate,
    async (req, res, next) => {
        try {
            const server = await serversService.findById(req.params.id, req.user.id, req.user.role.name);
            res.json(server);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers:
 *   post:
 *     tags: [Servers]
 *     summary: Adaugare server nou
 *     security: [{ bearerAuth: [] }]
 */
router.post('/',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('CREATE', 'SERVER'),
    [
        body('name').notEmpty().withMessage('Nume obligatoriu'),
        body('hostname').notEmpty().withMessage('Hostname obligatoriu'),
        body('ipAddress').optional().isString(),
        body('description').optional().isString(),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const server = await serversService.create(req.body);
            res.status(201).json(server);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}:
 *   put:
 *     tags: [Servers]
 *     summary: Actualizare server
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id',
    authenticate,
    authorize('ADMIN'),
    auditLog('UPDATE', 'SERVER'),
    async (req, res, next) => {
        try {
            const server = await serversService.update(req.params.id, req.body);
            res.json(server);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}:
 *   delete:
 *     tags: [Servers]
 *     summary: Stergere server
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id',
    authenticate,
    authorize('ADMIN'),
    auditLog('DELETE', 'SERVER'),
    async (req, res, next) => {
        try {
            const result = await serversService.delete(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/enrollToken:
 *   get:
 *     tags: [Servers]
 *     summary: Returnare token inregistrare existent
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/enrollToken',
    authenticate,
    async (req, res, next) => {
        try {
            const result = await serversService.getEnrollToken(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/enrollToken:
 *   post:
 *     tags: [Servers]
 *     summary: Generare token inregistrare pentru agent
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/enrollToken',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const result = await serversService.generateEnrollToken(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/permissions:
 *   get:
 *     tags: [Servers]
 *     summary: Lista permisiuni pentru server
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/permissions',
    authenticate,
    authorize('ADMIN'),
    async (req, res, next) => {
        try {
            const permissions = await serversService.getPermissions(req.params.id);
            res.json(permissions);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/permissions:
 *   post:
 *     tags: [Servers]
 *     summary: Acordare permisiune utilizator pentru server
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/permissions',
    authenticate,
    authorize('ADMIN'),
    auditLog('GRANT_PERMISSION', 'SERVER'),
    async (req, res, next) => {
        try {
            const { userId, capabilities, expiresAt } = req.body;
            const result = await serversService.grantPermission(req.params.id, userId, capabilities, expiresAt);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/permissions/{userId}:
 *   delete:
 *     tags: [Servers]
 *     summary: Revocare permisiune utilizator pentru server
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id/permissions/:userId',
    authenticate,
    authorize('ADMIN'),
    auditLog('REVOKE_PERMISSION', 'SERVER'),
    async (req, res, next) => {
        try {
            const result = await serversService.revokePermission(req.params.id, req.params.userId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/metrics/latest:
 *   get:
 *     tags: [Servers]
 *     summary: Ultimele metrici pentru server
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/metrics/latest',
    authenticate,
    async (req, res, next) => {
        try {
            const metrics = await serversService.getLatestMetrics(req.params.id);
            res.json(metrics);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/inventory/latest:
 *   get:
 *     tags: [Servers]
 *     summary: Ultimul snapshot inventar pentru server
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/inventory/latest',
    authenticate,
    async (req, res, next) => {
        try {
            const inventory = await serversService.getLatestInventory(req.params.id);
            res.json(inventory);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/audits:
 *   get:
 *     tags: [Servers]
 *     summary: Istoric audituri pentru un server
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/audits',
    authenticate,
    async (req, res, next) => {
        try {
            const auditService = await import('../services/audit.service.js');
            const audits = await auditService.findAll(req.params.id);
            res.json(audits);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /servers/{id}/run-check:
 *   post:
 *     tags: [Servers]
 *     summary: Rulare verificare ad-hoc pe agent
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/run-check',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    async (req, res, next) => {
        try {
            const agentService = await import('../services/agent.service.js');
            const result = await agentService.runAdhocCheck(req.params.id, req.body);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
