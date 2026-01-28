import express from 'express';
import multer from 'multer';
import * as auditService from '../services/audit.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { auditLog } from '../middleware/audit.middleware.js';

const router = express.Router();

// Configurare multer pentru incarcare dovezi
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

/**
 * @swagger
 * /audit:
 *   get:
 *     tags: [Audit]
 *     summary: Lista rulari audit
 *     security: [{ bearerAuth: [] }]
 */
router.get('/',
    authenticate,
    async (req, res, next) => {
        try {
            const audits = await auditService.findAll(req.query.serverId);
            res.json(audits);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/{id}:
 *   get:
 *     tags: [Audit]
 *     summary: Detalii rulare audit
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id',
    authenticate,
    async (req, res, next) => {
        try {
            const audit = await auditService.findById(req.params.id);
            res.json(audit);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/{id}/progress:
 *   get:
 *     tags: [Audit]
 *     summary: Progres rulare audit
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/progress',
    authenticate,
    async (req, res, next) => {
        try {
            const progress = await auditService.getProgress(req.params.id);
            res.json(progress);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/run:
 *   post:
 *     tags: [Audit]
 *     summary: Pornire audit
 *     security: [{ bearerAuth: [] }]
 */
router.post('/run',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('RUN_AUDIT', 'AUDIT'),
    async (req, res, next) => {
        try {
            const result = await auditService.runAudit(req.body, req.user.id);
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/{id}/complete:
 *   post:
 *     tags: [Audit]
 *     summary: Finalizare audit (calculare scor final)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/complete',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    async (req, res, next) => {
        try {
            const result = await auditService.completeAudit(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/{runId}/manual/{taskId}/evidence:
 *   post:
 *     tags: [Audit]
 *     summary: Transmitere dovezi pentru sarcina manuala
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:runId/manual/:taskId/evidence',
    authenticate,
    upload.single('file'),
    async (req, res, next) => {
        try {
            const result = await auditService.submitEvidence(
                req.params.runId,
                req.params.taskId,
                { ...req.body, uploadedBy: req.user.id },
                req.file
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/{runId}/manual/{taskId}/approve:
 *   post:
 *     tags: [Audit]
 *     summary: Aprobare/Respingere sarcina manuala
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:runId/manual/:taskId/approve',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    async (req, res, next) => {
        try {
            const result = await auditService.approveTask(
                req.params.runId,
                req.params.taskId,
                req.body.approved,
                req.user.id,
                req.body.notes
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /audit/{runId}/manual/{taskId}/reset:
 *   post:
 *     tags: [Audit]
 *     summary: Resetare sarcina manuala la IN ASTEPTARE
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:runId/manual/:taskId/reset',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    async (req, res, next) => {
        try {
            const result = await auditService.resetTask(
                req.params.runId,
                req.params.taskId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
