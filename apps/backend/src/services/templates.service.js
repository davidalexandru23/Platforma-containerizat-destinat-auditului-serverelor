const { prisma } = require('../lib/prisma');
const { NotFoundError, BadRequestError } = require('../middleware/error.middleware');

class TemplatesService {
    async findAll() {
        return prisma.template.findMany({
            include: {
                versions: {
                    where: { isActive: true },
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

    async findById(id) {
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

    async create(data) {
        // valideaza si mapeaza tipul
        const validType = this.mapTemplateType(data.type);

        return prisma.template.create({
            data: {
                name: data.name,
                description: data.description || '',
                type: validType,
                createdBy: data.createdBy,
            },
        });
    }

    async importJson(jsonData, userId) {
        // valideaza structura
        const validation = this.validateJson(jsonData);
        if (!validation.valid) {
            throw new BadRequestError(`Template JSON invalid: ${validation.errors.join(', ')}`);
        }

        const { metadata, controls } = jsonData;

        // creeaza template si versiune
        const template = await prisma.template.create({
            data: {
                name: metadata.name,
                description: metadata.description,
                type: this.mapTemplateType(metadata.type),
                createdBy: userId,
                versions: {
                    create: {
                        version: metadata.version || '1.0.0',
                        changelog: metadata.changelog,
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

    validateJson(data) {
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

        return {
            valid: errors.length === 0,
            errors,
            summary: errors.length === 0 ? {
                name: data.metadata?.name,
                version: data.metadata?.version,
                controlsCount: data.controls?.length || 0,
            } : null,
        };
    }

    async exportJson(id) {
        const template = await this.findById(id);
        const version = template.versions.find(v => v.isActive) || template.versions[0];

        // Allow export even without version - export metadata only
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

    async getActiveVersion(templateId) {
        const version = await prisma.templateVersion.findFirst({
            where: { templateId, isActive: true },
            include: {
                controls: {
                    include: {
                        automatedChecks: true,
                        manualChecks: { include: { evidenceSpec: true } },
                    },
                },
            },
        });

        if (!version) {
            throw new NotFoundError('Nicio versiune activa');
        }

        return version;
    }

    async updateControls(id, controls) {
        const template = await prisma.template.findUnique({
            where: { id },
            include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
        });

        if (!template) {
            throw new NotFoundError('Template nu exista');
        }

        const latestVersion = template.versions[0];
        const newVersionNumber = latestVersion
            ? this.incrementVersion(latestVersion.version)
            : '1.0.0';

        // Create new version with updated controls
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

    incrementVersion(version) {
        const parts = version.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        return parts.join('.');
    }

    async delete(id) {
        const template = await prisma.template.findUnique({ where: { id } });

        if (!template) {
            throw new NotFoundError('Template nu exista');
        }

        if (template.isBuiltIn) {
            throw new BadRequestError('Nu poti sterge template-uri built-in');
        }

        await prisma.template.delete({ where: { id } });

        return { message: 'Template sters' };
    }

    // Get predefined templates from /templates folder
    async getPredefinedTemplates() {
        const fs = require('fs');
        const path = require('path');
        // In Docker: /app/templates, locally: ../../templates
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

    // Get single predefined template content
    async getPredefinedTemplateContent(filename) {
        const fs = require('fs');
        const path = require('path');
        // In Docker: /app/templates, locally: ../../templates
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

    // Publish template (create active version)
    async publish(id) {
        const template = await prisma.template.findUnique({
            where: { id },
            include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
        });

        if (!template) {
            throw new NotFoundError('Template nu exista');
        }

        // If no version exists, create one
        if (template.versions.length === 0) {
            throw new BadRequestError('Template-ul nu are nicio versiune cu controale');
        }

        // Activate latest version
        const latestVersion = template.versions[0];

        await prisma.templateVersion.update({
            where: { id: latestVersion.id },
            data: { isActive: true }
        });

        return { message: 'Template publicat cu succes' };
    }

    mapTemplateType(type) {
        const typeMap = {
            CIS_BENCHMARK: 'CIS_BENCHMARK',
            CIS_CONTROLS: 'CIS_CONTROLS',
            CUSTOM: 'CUSTOM',
        };
        return typeMap[type] || 'CUSTOM';
    }
}

module.exports = new TemplatesService();

