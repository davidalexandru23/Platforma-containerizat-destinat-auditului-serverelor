import express from 'express';
import * as agentService from '../services/agent.service.js';
import { agentLimiter } from '../middleware/rate-limit.middleware.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @swagger
 * /agent/enroll:
 *   post:
 *     tags: [Agent]
 *     summary: Inregistrare agent pe server
 */
router.post('/enroll',
    agentLimiter,
    [
        body('enrollToken').notEmpty().withMessage('Token inregistrare obligatoriu'),
        body('version').optional().isString(),
        body('osInfo').optional().isString(),
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const result = await agentService.enroll(req.body);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /agent/{serverId}/metrics:
 *   post:
 *     tags: [Agent]
 *     summary: Incarcare metrici de la agent
 */
router.post('/:serverId/metrics',
    agentLimiter,
    async (req, res, next) => {
        try {
            const agentToken = req.headers['x-agent-token'];
            // Extragere IP (gestioneaza header-ele proxy daca este necesar, dar req.ip este un inceput bun)
            const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
            const result = await agentService.submitMetrics(req.params.serverId, req.body, agentToken, ipAddress);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /agent/{serverId}/inventory:
 *   post:
 *     tags: [Agent]
 *     summary: Incarcare snapshot inventar de la agent
 */
router.post('/:serverId/inventory',
    agentLimiter,
    async (req, res, next) => {
        try {
            const agentToken = req.headers['x-agent-token'];
            const result = await agentService.submitInventory(req.params.serverId, req.body, agentToken);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /agent/{serverId}/audit/{auditRunId}/results:
 *   post:
 *     tags: [Agent]
 *     summary: Incarcare rezultate verificari de la agent
 */
router.post('/:serverId/audit/:auditRunId/results',
    agentLimiter,
    async (req, res, next) => {
        try {
            const agentToken = req.headers['x-agent-token'];
            const result = await agentService.submitCheckResults(
                req.params.serverId,
                req.params.auditRunId,
                req.body,
                agentToken
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /agent/{serverId}/audit/pending:
 *   get:
 *     tags: [Agent]
 *     summary: Obtinere verificari de rulat pentru audit-uri active
 */
router.get('/:serverId/audit/pending',
    async (req, res, next) => {
        try {
            const agentToken = req.headers['x-agent-token'];
            const checks = await agentService.getPendingAuditChecks(req.params.serverId, agentToken);
            res.json(checks);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
