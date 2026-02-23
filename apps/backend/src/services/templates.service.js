
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../middleware/error.middleware.js';
import * as notificationService from './notification.service.js';
import { validateAllCommands } from './commandValidator.service.js';

async function findAll() {
    return prisma.template.findMany({
        include: {
            versions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { _count: { select: { controls: true } } },
            },
            creator: {
                select: { id: true, firstName: true, lastName: true, email: true }
            }
        },
        orderBy: { createdAt: 'desc' },
    });
}

async function findById(id) {
    const template = await prisma.template.findUnique({
        where: { id },
        include: {
            versions: {
                orderBy: { createdAt: 'desc' },
                include: {
                    controls: {
                        include: {
                            automatedChecks: true,
                            manualChecks: { include: { evidenceSpec: true } },
                        },
                    },
                },
            },
            creator: {
                select: { id: true, firstName: true, lastName: true, email: true }
            }
        },
    });

    if (!template) {
        throw new NotFoundError('Template nu exista');
    }

    return template;
}

async function create(data) {
    // Validare si mapare tip
    const validType = mapTemplateType(data.type);

    return prisma.template.create({
        data: {
            name: data.name,
            description: data.description || '',
            type: validType,
            createdBy: data.createdBy,
        },
    });
}

async function importJson(jsonData, userId, isBuiltIn = false) {
    // Validare structura
    const validation = validateJson(jsonData);
    if (!validation.valid) {
        throw new BadRequestError(`Template JSON invalid: ${validation.errors.join(', ')}`);
    }

    // Validare comenzi din controale
    const cmdValidation = validateAllCommands(jsonData.controls);
    if (!cmdValidation.valid) {
        const err = new BadRequestError('Template contine comenzi interzise');
        err.commandErrors = cmdValidation.errors;
        throw err;
    }

    const { metadata, controls } = jsonData;

    // Creare template si versiune
    const template = await prisma.template.create({
        data: {
            name: metadata.name,
            description: metadata.description,
            type: mapTemplateType(metadata.type),
            createdBy: userId,
            isBuiltIn: isBuiltIn,
            versions: {
                create: {
                    version: metadata.version || '1.0.0',
                    changelog: metadata.changelog,
                    isActive: false,
                    controls: {
                        create: controls.map(control => ({
                            controlId: control.controlId,
                            title: control.title,
                            category: control.category,
                            severity: control.severity,
                            rationale: control.rationale,
                            automatedChecks: {
                                create: (control.automatedChecks || []).map(check => ({
                                    checkId: check.checkId,
                                    title: check.title,
                                    description: check.description,
                                    command: check.command,
                                    script: check.script,
                                    expectedResult: check.expectedResult,
                                    checkType: check.checkType,
                                    comparison: check.comparison || 'EQUALS',
                                    parser: check.parser || 'RAW',
                                    normalize: check.normalize || [],
                                    onFailMessage: check.onFailMessage,
                                    platformScope: check.platformScope || [],
                                })),
                            },
                            manualChecks: {
                                create: (control.manualChecks || []).map(check => ({
                                    checkId: check.checkId,
                                    title: check.title,
                                    description: check.description,
                                    instructions: check.instructions,
                                    evidenceSpec: check.evidenceSpec
                                        ? {
                                            create: {
                                                allowUpload: check.evidenceSpec.allowUpload ?? true,
                                                allowLink: check.evidenceSpec.allowLink ?? true,
                                                allowAttestation: check.evidenceSpec.allowAttestation ?? true,
                                                requiresApproval: check.evidenceSpec.requiresApproval ?? false,
                                                acceptedFileTypes: check.evidenceSpec.acceptedFileTypes || [],
                                            },
                                        }
                                        : undefined,
                                })),
                            },
                        })),
                    },
                },
            },
        },
        include: {
            versions: { include: { _count: { select: { controls: true } } } },
        },
    });

    return { template, message: 'Template importat cu succes' };
}

async function importOrUpdatePredefinedTemplate(jsonData) {
    // Validare structura
    const validation = validateJson(jsonData);
    if (!validation.valid) {
        let msg = `Template JSON invalid: ${validation.errors.join(', ')}`;
        if (validation.commandErrors && validation.commandErrors.length > 0) {
            msg += ` | Command Errors: ${JSON.stringify(validation.commandErrors)}`;
        }
        throw new Error(msg);
    }

    const { metadata, controls } = jsonData;

    // Cautare template existent
    const existingTemplate = await prisma.template.findFirst({
        where: { name: metadata.name },
        include: { versions: true }
    });

    if (!existingTemplate) {
        // Nu exista => Import normal (creare nou) ca BuiltIn
        const result = await importJson(jsonData, null, true);
        // Auto-publish predefined templates
        if (result.template?.id) {
            await publish(result.template.id);
        }
        return result;
    }

    // Asigurare ca este marcat ca built-in
    if (!existingTemplate.isBuiltIn) {
        await prisma.template.update({
            where: { id: existingTemplate.id },
            data: { isBuiltIn: true }
        });
    }

    // Exista => Verificare versiune
    const versionExists = existingTemplate.versions.some(v => v.version === metadata.version);
    if (versionExists) {
        return { message: `Versiunea ${metadata.version} exista deja`, skipped: true };
    }

    // Versiune noua => Adaugare TemplateVersion
    console.log(`Updating template "${metadata.name}" to version ${metadata.version}`);

    await prisma.templateVersion.create({
        data: {
            templateId: existingTemplate.id,
            version: metadata.version,
            changelog: metadata.changelog,
            isActive: true, // Auto-activate new predefined versions
            controls: {
                create: controls.map(control => ({
                    controlId: control.controlId,
                    title: control.title,
                    category: control.category,
                    severity: control.severity,
                    rationale: control.rationale,
                    automatedChecks: {
                        create: (control.automatedChecks || []).map(check => ({
                            checkId: check.checkId,
                            title: check.title,
                            description: check.description,
                            command: check.command,
                            script: check.script,
                            expectedResult: check.expectedResult,
                            checkType: check.checkType,
                            comparison: check.comparison || 'EQUALS',
                            parser: check.parser || 'RAW',
                            normalize: check.normalize || [],
                            onFailMessage: check.onFailMessage,
                            platformScope: check.platformScope || [],
                        })),
                    },
                    manualChecks: {
                        create: (control.manualChecks || []).map(check => ({
                            checkId: check.checkId,
                            title: check.title,
                            description: check.description,
                            instructions: check.instructions,
                            evidenceSpec: check.evidenceSpec
                                ? {
                                    create: {
                                        allowUpload: check.evidenceSpec.allowUpload ?? true,
                                        allowLink: check.evidenceSpec.allowLink ?? true,
                                        allowAttestation: check.evidenceSpec.allowAttestation ?? true,
                                        requiresApproval: check.evidenceSpec.requiresApproval ?? false,
                                        acceptedFileTypes: check.evidenceSpec.acceptedFileTypes || [],
                                    },
                                }
                                : undefined,
                        })),
                    },
                })),
            },
        },
    });

    return { message: `Updated to version ${metadata.version}`, updated: true };
}

function validateJson(data) {
    const errors = [];

    if (!data.$schema || !data.$schema.startsWith('bittrail-template@')) {
        errors.push('Schema lipsa sau invalida');
    }

    if (!data.metadata) {
        errors.push('Sectiunea "metadata" lipseste');
    } else {
        if (!data.metadata.name) errors.push('metadata.name obligatoriu');
        if (!data.metadata.version) errors.push('metadata.version obligatoriu');
    }

    if (!data.controls || !Array.isArray(data.controls)) {
        errors.push('Sectiunea "controls" lipseste sau nu este array');
    } else {
        data.controls.forEach((control, i) => {
            const prefix = `controls[${i}]`;
            if (!control.controlId) errors.push(`${prefix}.controlId obligatoriu`);
            if (!control.title) errors.push(`${prefix}.title obligatoriu`);
            if (!control.category) errors.push(`${prefix}.category obligatoriu`);
            if (!control.severity) errors.push(`${prefix}.severity obligatoriu`);
            else if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(control.severity)) {
                errors.push(`${prefix}.severity invalid`);
            }
        });
    }

    // Validare comenzi din controale
    let commandErrors = [];
    if (data.controls && Array.isArray(data.controls)) {
        const cmdValidation = validateAllCommands(data.controls);
        commandErrors = cmdValidation.errors;
    }

    return {
        valid: errors.length === 0 && commandErrors.length === 0,
        errors,
        commandErrors,
        summary: errors.length === 0 && commandErrors.length === 0 ? {
            name: data.metadata?.name,
            version: data.metadata?.version,
            controlsCount: data.controls?.length || 0,
        } : null,
    };
}

async function exportJson(id) {
    const template = await findById(id);
    const version = template.versions.find(v => v.isActive) || template.versions[0];

    // Permite export chiar si fara versiune - export doar metadate
    const controls = version?.controls || [];

    return {
        $schema: 'bittrail-template@1.0',
        metadata: {
            name: template.name,
            description: template.description || '',
            type: template.type,
            version: version?.version || '1.0.0',
            exportedAt: new Date().toISOString(),
        },
        controls: controls.map(control => ({
            controlId: control.controlId,
            title: control.title,
            category: control.category,
            severity: control.severity,
            rationale: control.rationale,
            automatedChecks: control.automatedChecks.map(check => ({
                checkId: check.checkId,
                title: check.title,
                description: check.description,
                command: check.command,
                script: check.script,
                expectedResult: check.expectedResult,
                checkType: check.checkType,
                comparison: check.comparison,
                parser: check.parser,
                normalize: check.normalize,
                onFailMessage: check.onFailMessage,
                platformScope: check.platformScope,
            })),
            manualChecks: control.manualChecks.map(check => ({
                checkId: check.checkId,
                title: check.title,
                description: check.description,
                instructions: check.instructions,
                evidenceSpec: check.evidenceSpec ? {
                    allowUpload: check.evidenceSpec.allowUpload,
                    allowLink: check.evidenceSpec.allowLink,
                    allowAttestation: check.evidenceSpec.allowAttestation,
                    requiresApproval: check.evidenceSpec.requiresApproval,
                } : null,
            })),
        })),
    };
}

async function getActiveVersion(templateId) {
    const version = await prisma.templateVersion.findFirst({
        where: { templateId, isActive: true },
        orderBy: { createdAt: 'desc' },
        include: {
            controls: {
                include: {
                    automatedChecks: true,
                    manualChecks: { include: { evidenceSpec: true } },
                },
            },
        },
    });

    if (version) {
        console.log(`getActiveVersion ${templateId}: found active version v${version.version} (ID: ${version.id})`);
        console.log(`Template stats: ${version.controls.length} controls loaded.`);
    } else {
        console.log(`getActiveVersion ${templateId}: No active version found.`);
    }

    if (!version) {
        throw new NotFoundError('Nicio versiune activa');
    }

    return version;
}

async function updateControls(id, controls, userRole) {
    // Validare comenzi inainte de salvare
    const cmdValidation = validateAllCommands(controls);
    if (!cmdValidation.valid) {
        const err = new BadRequestError('Controalele contin comenzi interzise');
        err.commandErrors = cmdValidation.errors;
        throw err;
    }

    const template = await prisma.template.findUnique({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!template) {
        throw new NotFoundError('Template nu exista');
    }

    // Restrictie editare template-uri predefinite (doar ADMIN)
    if (template.isBuiltIn && userRole !== 'ADMIN') {
        const { ForbiddenError } = await import('../middleware/error.middleware.js');
        throw new ForbiddenError('Doar administratorii pot edita template-uri predefinite');
    }

    const latestVersion = template.versions[0];
    const newVersionNumber = latestVersion
        ? incrementVersion(latestVersion.version)
        : '1.0.0';

    // Creare versiune noua cu controale actualizate
    const newVersion = await prisma.templateVersion.create({
        data: {
            templateId: id,
            version: newVersionNumber,
            isActive: false,
            controls: {
                create: controls.map((control) => ({
                    controlId: control.controlId,
                    title: control.title,
                    category: control.category,
                    severity: control.severity || 'MEDIUM',
                    rationale: control.rationale || '',
                    automatedChecks: {
                        create: (control.automatedChecks || []).map((check, checkIdx) => ({
                            checkId: check.checkId || `check-${checkIdx}`,
                            title: check.title || 'Check',
                            command: check.command || '',
                            expectedResult: check.expectedResult || '',
                            checkType: check.checkType,
                            comparison: check.comparison || 'EQUALS',
                            parser: check.parser || 'RAW',
                            normalize: check.normalize || [],
                            onFailMessage: check.onFailMessage || null,
                            platformScope: check.platformScope || [],
                        })),
                    },
                    manualChecks: {
                        create: (control.manualChecks || []).map((check, checkIdx) => ({
                            checkId: check.checkId || `manual-${checkIdx}`,
                            title: check.title || 'Manual Check',
                            description: check.description || '',
                            instructions: check.instructions || '',
                            evidenceSpec: check.evidenceSpec
                                ? {
                                    create: {
                                        allowUpload: check.evidenceSpec.allowUpload ?? true,
                                        allowLink: check.evidenceSpec.allowLink ?? true,
                                        allowAttestation: check.evidenceSpec.allowAttestation ?? true,
                                        requiresApproval: check.evidenceSpec.requiresApproval ?? false,
                                        acceptedFileTypes: check.evidenceSpec.acceptedFileTypes || [],
                                    },
                                }
                                : undefined,
                        })),
                    },
                })),
            },
        },
        include: { controls: true },
    });

    return {
        message: `Versiune ${newVersionNumber} creata cu ${controls.length} controale`,
        version: newVersion
    };
}

function incrementVersion(version) {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
}

async function deleteTemplate(id) {
    const template = await prisma.template.findUnique({
        where: { id },
        include: { versions: { select: { id: true } } }
    });

    if (!template) {
        throw new NotFoundError('Template nu exista');
    }

    if (template.isBuiltIn) {
        throw new BadRequestError('Nu poti sterge template-uri built-in');
    }

    // Stergere in cascada manuala pentru RulariAudit (lipseste relatia cascada specifica in schema)
    const versionIds = template.versions.map(v => v.id);
    if (versionIds.length > 0) {
        await prisma.auditRun.deleteMany({
            where: { templateVersionId: { in: versionIds } }
        });
    }

    await prisma.template.delete({ where: { id } });

    return { message: 'Template sters' };
}

// Obtinere template-uri predefinite din folderul /templates
async function getPredefinedTemplates() {
    // In Docker: /app/templates, local: ../../templates
    let templatesDir = path.join(process.cwd(), 'templates');
    if (!fs.existsSync(templatesDir)) {
        templatesDir = path.join(process.cwd(), '..', '..', 'templates');
    }

    try {
        const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        const templates = [];

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
                const json = JSON.parse(content);
                templates.push({
                    filename: file,
                    name: json.metadata?.name || file,
                    description: json.metadata?.description || '',
                    version: json.metadata?.version || '1.0.0',
                    type: json.metadata?.type || 'CUSTOM',
                    controlsCount: json.controls?.length || 0,
                });
            } catch (e) {
                console.error(`Error reading template ${file}:`, e.message);
            }
        }

        return templates;
    } catch (e) {
        console.error('Error reading templates directory:', e.message);
        return [];
    }
}

// Obtinere continut template predefinit unic
async function getPredefinedTemplateContent(filename) {
    // In Docker: /app/templates, local: ../../templates
    let templatesDir = path.join(process.cwd(), 'templates');
    if (!fs.existsSync(templatesDir)) {
        templatesDir = path.join(process.cwd(), '..', '..', 'templates');
    }
    const filePath = path.join(templatesDir, filename);

    if (!fs.existsSync(filePath)) {
        throw new NotFoundError('Template predefinit nu exista');
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
}

// Publicare template (creare versiune activa)
async function publish(id) {
    const template = await prisma.template.findUnique({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!template) {
        throw new NotFoundError('Template nu exista');
    }

    // Daca nu exista nicio versiune, creare una
    if (template.versions.length === 0) {
        throw new BadRequestError('Template-ul nu are nicio versiune cu controale');
    }

    // Activare ultima versiune
    const latestVersion = template.versions[0];

    await prisma.templateVersion.update({
        where: { id: latestVersion.id },
        data: { isActive: true }
    });

    notificationService.notify({
        scope: 'org',
        type: notificationService.NotificationType.TEMPLATE_PUBLISHED,
        title: 'Template Published',
        body: `Template ${template.name} v${latestVersion.version} este acum activ.`
    });

    return { message: 'Template publicat cu succes' };
}

function mapTemplateType(type) {
    const typeMap = {
        CIS_BENCHMARK: 'CIS_BENCHMARK',
        CIS_CONTROLS: 'CIS_CONTROLS',
        NIS2: 'NIS2',
        NIST: 'NIST',
        MITRE: 'MITRE',
        SUPPLY_CHAIN: 'SUPPLY_CHAIN',
        ISO27001: 'ISO27001',
        GDPR: 'GDPR',
        PCI_DSS: 'PCI_DSS',
        CUSTOM: 'CUSTOM',
    };
    return typeMap[type] || 'CUSTOM';
}

export {
    findAll,
    findById,
    create,
    importJson,
    importOrUpdatePredefinedTemplate,
    validateJson,
    exportJson,
    getActiveVersion,
    updateControls,
    deleteTemplate as delete,
    getPredefinedTemplates,
    getPredefinedTemplateContent,
    publish,
    mapTemplateType,
};
