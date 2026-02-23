import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../middleware/error.middleware.js';
import * as notificationService from './notification.service.js';
import * as scoringService from './scoring.service.js';
import * as templatesService from './templates.service.js';

// WebSocket - setat din main.js
let io = null;
const setIO = (socketIO) => { io = socketIO; };

/**
 * Initiere audit nou pentru un server specificat.
 * Verificare status server si pregatire lista de verificari.
 */
async function findAll(serverId) {
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

/**
 * Returnare detalii complete audit, inclusiv rezultatele verificarilor.
 * Folosit in pagina Detalii Audit pentru afisarea progresului.
 * @param {string} id - ID-ul auditului
 */
async function findById(id) {
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

/**
 * Initiere audit nou pentru un server specificat.
 * 1. Validare server si template.
 * 2. Creare intrare in baza de date (RulareAudit).
 * 3. Instantiere sarcini manuale (nu necesita agent).
 * 4. Daca serverul este online, pornire verificari automate.
 * 
 * @param {Object} data - Datele auditului (serverId, templateId)
 * @param {string} userId - ID-ul utilizatorului care a initiat auditul
 */
async function runAudit(data, userId) {
    const { serverId, templateId, excludedControlIds } = data;

    // Validare existenta server
    const server = await prisma.server.findUnique({
        where: { id: serverId },
        include: { agentIdentity: true },
    });

    if (!server) {
        throw new NotFoundError('Server nu exista');
    }

    // Blocare pornire audit daca serverul este offline
    if (server.status !== 'ONLINE') {
        throw new BadRequestError('Nu poti porni audit pe un server offline. Verifica ca agentul e conectat.');
    }

    // Determinare cea mai recenta versiune a template-ului
    const templateVersion = await templatesService.getActiveVersion(templateId);

    // Initializare intrare audit in baza de date (status IN ASTEPTARE)
    const auditRun = await prisma.auditRun.create({
        data: {
            serverId,
            templateVersionId: templateVersion.id,
            status: 'PENDING',
            triggeredBy: userId,
            excludedControlIds: excludedControlIds || [],
        },
    });

    // Pregatire sarcini manuale (nu depind de agent)
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

    // Cleanup periodic metrici vechi (MetricSample, InventorySnapshot)

    // Calculare numar verificari automate necesare
    const activeControls = templateVersion.controls.filter(c => !excludedControlIds?.includes(c.controlId));
    const totalAutomatedChecks = activeControls.reduce((sum, c) => sum + c.automatedChecks.length, 0);

    console.log(`Reviewing audit plan: found ${totalAutomatedChecks} automated checks and ${manualChecks.length} manual tasks for template v${templateVersion.version}.`);

    // Daca nu exista verificari automate, marcare audit ca finalizat sau in asteptare manuala
    if (totalAutomatedChecks === 0) {
        if (manualChecks.length === 0) {
            console.log('No checks found in template. Marking audit as auto-completed.');
            await prisma.auditRun.update({
                where: { id: auditRun.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    automatedCompliancePercent: 100,
                    manualCompletionPercent: 100,
                    overallStatus: 'COMPLIANT'
                }
            });
            return { auditRun: { ...auditRun, status: 'COMPLETED' }, message: 'Audit finalizat (fara verificari)' };
        } else {
            console.log('Only manual tasks found. Audit set to IN_PROGRESS for human review.');
            await prisma.auditRun.update({
                where: { id: auditRun.id },
                data: { status: 'IN_PROGRESS', startedAt: new Date() }
            });
            return { auditRun, message: 'Audit creat (doar verificari manuale)' };
        }
    }

    // Daca agent este online si exista verificari automate, pornire audit
    if (server.status === 'ONLINE') {
        await prisma.auditRun.update({
            where: { id: auditRun.id },
            data: { status: 'RUNNING', startedAt: new Date() },
        });

        // Difuzare progres
        if (io) {
            io.of('/ws/audit').to(`audit:${auditRun.id}`).emit('progress', {
                auditRunId: auditRun.id,
                status: 'RUNNING',
                message: 'Audit pornit, se asteapta rezultate',
                progress: 0,
            });
        }
    } else if (server.status !== 'ONLINE') {
        // Server offline, ramane PENDING
        // Notificare utilizator agent offline (TODO)
    }

    return { auditRun, message: 'Audit creat cu succes' };
}

async function getProgress(id) {
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

async function submitEvidence(auditRunId, taskId, data, file) {
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

    // Actualizare status sarcina
    await prisma.manualTaskResult.update({
        where: { id: taskId },
        data: {
            status: task.manualCheck.evidenceSpec?.requiresApproval ? 'IN_PROGRESS' : 'COMPLETED',
        },
    });

    await updateAuditScoring(auditRunId);

    return evidence;
}

async function approveTask(auditRunId, taskId, approved, reviewerId, notes) {
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

    await updateAuditScoring(auditRunId);

    notificationService.notify({
        scope: 'user',
        type: approved ? notificationService.NotificationType.EVIDENCE_APPROVED : notificationService.NotificationType.EVIDENCE_REJECTED,
        title: `Evidence ${approved ? 'Approved' : 'Rejected'}`,
        body: `Task manual ${approved ? 'aprobat' : 'respins'}. Notes: ${notes || '-'}`
    });

    return { message: approved ? 'Task aprobat' : 'Task respins' };
}

async function resetTask(auditRunId, taskId) {
    const task = await prisma.manualTaskResult.findUnique({ where: { id: taskId } });

    if (!task || task.auditRunId !== auditRunId) {
        throw new NotFoundError('Task nu exista');
    }

    await prisma.manualTaskResult.update({
        where: { id: taskId },
        data: {
            status: 'PENDING',
            reviewedBy: null,
            reviewedAt: null,
            // Keep reviewNotes to preserve any context
        },
    });

    await updateAuditScoring(auditRunId);

    return { message: 'Task resetat la PENDING' };
}

async function completeAudit(id) {
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

    // Actualizare nivel risc server
    const riskLevel = scoringService.calculateRiskLevel(scoring);
    await prisma.server.update({
        where: { id: auditRun.serverId },
        data: { riskLevel },
    });

    // Difuzare finalizare prin Serviciu Notificare
    const notificationType = scoring.overallStatus === 'NON_COMPLIANT'
        ? notificationService.NotificationType.AUDIT_FAILED
        : notificationService.NotificationType.AUDIT_COMPLETED;

    notificationService.notify({
        scope: 'org',
        type: notificationType,
        title: `Audit completed`,
        body: `Finalizat cu status: ${scoring.overallStatus}. Score: ${scoring.automatedCompliancePercent}%`,
        link: `/audits/${id}`
    });

    // Difuzare progres (suport legacy)
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

async function updateAuditScoring(auditRunId) {
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

async function cleanupStaleAudits() {
    const timeoutMinutes = 15;
    const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const offlineThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000); // Assuming same timeout for offline check

    // Verificare audituri blocate prea mult timp SAU server offline
    const stuckAudits = await prisma.auditRun.findMany({
        where: {
            status: 'RUNNING',
            OR: [
                { startedAt: { lt: timeoutThreshold } }, // Rulat de prea mult timp
                { server: { agentIdentity: { lastSeen: { lt: offlineThreshold } } } } // Server offline
            ]
        },
        include: { server: true }
    });

    // Marcare audituri blocate ca FAILED si notificare frontend
    for (const audit of stuckAudits) {
        await prisma.auditRun.update({
            where: { id: audit.id },
            data: {
                status: 'FAILED',
                completedAt: new Date(),
                score: 0 // Penalizare
            }
        });

        // Notificare utilizator agent offline
        notificationService.broadcastAuditStatus(audit.id, 'FAILED', audit.serverId);

        // Difuzare activitate pentru feed
        notificationService.broadcastActivity(
            'System',
            'AUDIT_FAILED',
            'Audit',
            audit.server?.hostname || audit.serverId
        );

        console.log(`[CLEANUP] Audit ${audit.id.substring(0, 8)} marcat FAILED (agent offline/timeout)`);
    }

    return staleAudits.length;
}

export {
    setIO,
    findAll,
    findById,
    runAudit,
    getProgress,
    submitEvidence,
    approveTask,
    resetTask,
    completeAudit,
    updateAuditScoring,
    cleanupStaleAudits,
};
