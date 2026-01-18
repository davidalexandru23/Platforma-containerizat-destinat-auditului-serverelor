const express = require('express');
const router = express.Router();
const templatesService = require('../services/templates.service');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { auditLog } = require('../middleware/audit.middleware');

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
 *     summary: Lista template-uri predefinite din codebase
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
 *     summary: Obtine continutul unui template predefinit
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
 *     summary: Detalii template cu controls
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
 *     summary: Creeaza template nou (gol)
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
 *     summary: Importa template din JSON
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
 *     summary: Valideaza template JSON fara import
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
 *     summary: Exporta template ca JSON
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
 *     summary: Obtine versiunea activa a template-ului
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
 *     summary: Publica template (activeaza versiunea)
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
 *     summary: Actualizeaza controalele template-ului (creeza versiune noua)
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id/controls',
    authenticate,
    authorize('ADMIN', 'AUDITOR'),
    auditLog('UPDATE', 'TEMPLATE'),
    async (req, res, next) => {
        try {
            const { controls } = req.body;
            const result = await templatesService.updateControls(req.params.id, controls);
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
 *     summary: Sterge template
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

module.exports = router;
