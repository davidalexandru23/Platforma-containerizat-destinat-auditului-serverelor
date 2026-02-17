import express from 'express';
import * as templatesService from '../services/templates.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { auditLog } from '../middleware/audit.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /templates:
 *   get:
 *     tags: [Templates]
 *     summary: Lista toate template-urile
 *     security: [{ bearerAuth: [] }]
 */
router.get('/',
    authenticate,
    async (req, res, next) => {
        try {
            const templates = await templatesService.findAll();
            res.json(templates);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/predefined:
 *   get:
 *     tags: [Templates]
 *     summary: Lista template-uri predefinite din cod
 *     security: [{ bearerAuth: [] }]
 */
router.get('/predefined',
    authenticate,
    async (req, res, next) => {
        try {
            const templates = await templatesService.getPredefinedTemplates();
            res.json(templates);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/predefined/{filename}:
 *   get:
 *     tags: [Templates]
 *     summary: Obtinere continut template predefinit
 *     security: [{ bearerAuth: [] }]
 */
router.get('/predefined/:filename',
    authenticate,
    async (req, res, next) => {
        try {
            const content = await templatesService.getPredefinedTemplateContent(req.params.filename);
            res.json(content);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/{id}:
 *   get:
 *     tags: [Templates]
 *     summary: Detalii template cu controale
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id',
    authenticate,
    async (req, res, next) => {
        try {
            const template = await templatesService.findById(req.params.id);
            res.json(template);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates:
 *   post:
 *     tags: [Templates]
 *     summary: Creare template nou (gol)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('CREATE', 'TEMPLATE'),
    async (req, res, next) => {
        try {
            const template = await templatesService.create({
                ...req.body,
                createdBy: req.user.id
            });
            res.status(201).json(template);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/importJson:
 *   post:
 *     tags: [Templates]
 *     summary: Importare template din JSON
 *     security: [{ bearerAuth: [] }]
 */
router.post('/importJson',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('IMPORT', 'TEMPLATE'),
    async (req, res, next) => {
        try {
            const result = await templatesService.importJson(req.body, req.user.id);
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/validateJson:
 *   post:
 *     tags: [Templates]
 *     summary: Validare template JSON fara import
 *     security: [{ bearerAuth: [] }]
 */
router.post('/validateJson',
    authenticate,
    async (req, res, next) => {
        try {
            const result = templatesService.validateJson(req.body);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/{id}/exportJson:
 *   get:
 *     tags: [Templates]
 *     summary: Exportare template ca JSON
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/exportJson',
    authenticate,
    async (req, res, next) => {
        try {
            const jsonData = await templatesService.exportJson(req.params.id);
            res.json(jsonData);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/{id}/activeVersion:
 *   get:
 *     tags: [Templates]
 *     summary: Obtinere versiune activa a template-ului
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/activeVersion',
    authenticate,
    async (req, res, next) => {
        try {
            const version = await templatesService.getActiveVersion(req.params.id);
            res.json(version);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/{id}/publish:
 *   put:
 *     tags: [Templates]
 *     summary: Publicare template (activare versiune)
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/publish',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('PUBLISH', 'TEMPLATE'),
    async (req, res, next) => {
        try {
            const result = await templatesService.publish(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/{id}/controls:
 *   put:
 *     tags: [Templates]
 *     summary: Actualizare controale template (creare versiune noua)
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/controls',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('UPDATE', 'TEMPLATE'),
    async (req, res, next) => {
        try {
            const { controls } = req.body;
            const result = await templatesService.updateControls(req.params.id, controls, req.user.role.name);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /templates/{id}:
 *   delete:
 *     tags: [Templates]
 *     summary: Stergere template
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id',
    authenticate,
    authorize('ADMIN'),
    auditLog('DELETE', 'TEMPLATE'),
    async (req, res, next) => {
        try {
            const result = await templatesService.delete(req.params.id);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

export default router;
