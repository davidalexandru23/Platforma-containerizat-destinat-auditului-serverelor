const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { prisma } = require('../lib/prisma');
const { NotFoundError, BadRequestError } = require('../middleware/error.middleware');
const scoringService = require('./scoring.service');
const templatesService = require('./templates.service');

// websocket - setat din main.js
let io = null;
const setIO = (socketIO) => { io = socketIO; };

class AuditService {
    async findAll(serverId) {
        const where = serverId ? { serverId } : {};

        return prisma.auditRun.findMany({
            where,
            include: {
                server: { select: { id: true, name: true, hostname: true } },
                templateVersion: {
                    include: {
                        template: { select: { id: true, name: true, type: true } },
                    },
                },
                _count: { select: { checkResults: true, manualTaskResults: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findById(id) {
        const auditRun = await prisma.auditRun.findUnique({
            where: { id },
            include: {
                server: true,
                templateVersion: {
                    include: {
                        template: true,
                        controls: {
                            include: {
                                automatedChecks: true,
                                manualChecks: { include: { evidenceSpec: true } },
                            },
                        },
                    },
                },
                checkResults: {
                    include: {
                        automatedCheck: { include: { control: true } },
                    },
                },
                manualTaskResults: {
                    include: {
                        manualCheck: { include: { control: true, evidenceSpec: true } },
                        evidence: true,
                    },
                },
            },
        });

        if (!auditRun) {
            throw new NotFoundError('Audit run nu exista');
        }

        return auditRun;
    }

    async runAudit(data, userId) {
        const { serverId, templateId, excludedControlIds } = data;

        // check server
        const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { agentIdentity: true },
        });

        if (!server) {
            throw new NotFoundError('Server nu exista');
        }

        // ia versiunea activa a template-ului
        const templateVersion = await templatesService.getActiveVersion(templateId);

        // creeaza audit run
        const auditRun = await prisma.auditRun.create({
            data: {
                serverId,
                templateVersionId: templateVersion.id,
                status: 'PENDING',
                triggeredBy: userId,
                excludedControlIds: excludedControlIds || [],
            },
        });

        // creeaza manual task results
        const manualChecks = templateVersion.controls
            .filter(c => !excludedControlIds?.includes(c.controlId))
            .flatMap(c => c.manualChecks);

        for (const check of manualChecks) {
            await prisma.manualTaskResult.create({
                data: {
                    auditRunId: auditRun.id,
                    manualCheckId: check.id,
                    status: 'PENDING',
                },
            });
        }

        // daca agent online, porneste audit
        if (server.agentIdentity?.agentToken && server.status === 'ONLINE') {
            await prisma.auditRun.update({
                where: { id: auditRun.id },
                data: { status: 'RUNNING', startedAt: new Date() },
            });

            // broadcast progress
            if (io) {
                io.of('/ws/audit').to(`audit:${auditRun.id}`).emit('progress', {
                    auditRunId: auditRun.id,
                    status: 'RUNNING',
                    message: 'Audit pornit, se asteapta rezultate',
                    progress: 0,
                });
            }
        }

        return { auditRun, message: 'Audit creat cu succes' };
    }

    async getProgress(id) {
        const auditRun = await prisma.auditRun.findUnique({
            where: { id },
            include: {
                templateVersion: {
                    include: {
                        controls: {
                            include: { automatedChecks: true, manualChecks: true },
                        },
                    },
                },
                checkResults: true,
                manualTaskResults: true,
            },
        });

        if (!auditRun) {
            throw new NotFoundError('Audit run nu exista');
        }

        const excludedIds = auditRun.excludedControlIds || [];
        const activeControls = auditRun.templateVersion.controls.filter(
            c => !excludedIds.includes(c.controlId)
        );

        const totalAutomated = activeControls.reduce((sum, c) => sum + c.automatedChecks.length, 0);
        const totalManual = activeControls.reduce((sum, c) => sum + c.manualChecks.length, 0);
        const completedAutomated = auditRun.checkResults.length;
        const completedManual = auditRun.manualTaskResults.filter(
            t => t.status !== 'PENDING' && t.status !== 'IN_PROGRESS'
        ).length;

        return {
            status: auditRun.status,
            automatedProgress: totalAutomated > 0 ? (completedAutomated / totalAutomated) * 100 : 100,
            manualProgress: totalManual > 0 ? (completedManual / totalManual) * 100 : 100,
            totalAutomated,
            completedAutomated,
            totalManual,
            completedManual,
            overallStatus: auditRun.overallStatus,
            automatedCompliancePercent: auditRun.automatedCompliancePercent,
            manualCompletionPercent: auditRun.manualCompletionPercent,
        };
    }

    async submitEvidence(auditRunId, taskId, data, file) {
        const task = await prisma.manualTaskResult.findUnique({
            where: { id: taskId },
            include: { manualCheck: { include: { evidenceSpec: true } } },
        });

        if (!task || task.auditRunId !== auditRunId) {
            throw new NotFoundError('Task nu exista');
        }

        if (task.status === 'COMPLETED' || task.status === 'REJECTED') {
            throw new BadRequestError('Task deja finalizat');
        }

        let evidenceData = {
            manualTaskResultId: taskId,
            type: data.type,
            uploadedBy: data.uploadedBy,
        };

        if (data.type === 'UPLOAD' && file) {
            const uploadDir = process.env.EVIDENCE_STORAGE_PATH || './uploads/evidence';
            const fileName = `${Date.now()}-${file.originalname}`;
            const filePath = path.join(uploadDir, auditRunId, taskId, fileName);

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, file.buffer);

            const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

            evidenceData = {
                ...evidenceData,
                filePath,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                fileHash,
            };
        } else if (data.type === 'LINK') {
            evidenceData.link = data.link;
        } else if (data.type === 'ATTESTATION') {
            evidenceData.attestation = data.attestation;
        }

        const evidence = await prisma.evidence.create({ data: evidenceData });

        // Update status task
        await prisma.manualTaskResult.update({
            where: { id: taskId },
            data: {
                status: task.manualCheck.evidenceSpec?.requiresApproval ? 'IN_PROGRESS' : 'COMPLETED',
            },
        });

        await this.updateAuditScoring(auditRunId);

        return evidence;
    }

    async approveTask(auditRunId, taskId, approved, reviewerId, notes) {
        const task = await prisma.manualTaskResult.findUnique({ where: { id: taskId } });

        if (!task || task.auditRunId !== auditRunId) {
            throw new NotFoundError('Task nu exista');
        }

        await prisma.manualTaskResult.update({
            where: { id: taskId },
            data: {
                status: approved ? 'COMPLETED' : 'REJECTED',
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
                reviewNotes: notes,
            },
        });

        await this.updateAuditScoring(auditRunId);

        return { message: approved ? 'Task aprobat' : 'Task respins' };
    }

    async completeAudit(id) {
        const auditRun = await prisma.auditRun.findUnique({ where: { id } });

        if (!auditRun) {
            throw new NotFoundError('Audit run nu exista');
        }

        const scoring = await scoringService.calculateScoring(id);

        await prisma.auditRun.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                automatedCompliancePercent: scoring.automatedCompliancePercent,
                manualCompletionPercent: scoring.manualCompletionPercent,
                overallStatus: scoring.overallStatus,
            },
        });

        // Broadcast completion
        if (io) {
            io.of('/ws/audit').to(`audit:${id}`).emit('progress', {
                auditRunId: id,
                status: 'COMPLETED',
                message: 'Audit finalizat',
                progress: 100,
                scoring,
            });
        }

        return { message: 'Audit finalizat', scoring };
    }

    async updateAuditScoring(auditRunId) {
        const scoring = await scoringService.calculateScoring(auditRunId);

        await prisma.auditRun.update({
            where: { id: auditRunId },
            data: {
                automatedCompliancePercent: scoring.automatedCompliancePercent,
                manualCompletionPercent: scoring.manualCompletionPercent,
                overallStatus: scoring.overallStatus,
            },
        });
    }
}

const auditService = new AuditService();
module.exports = auditService;
module.exports.setIO = setIO;
