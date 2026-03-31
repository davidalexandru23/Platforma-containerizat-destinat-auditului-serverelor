import { prisma } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../middleware/error.middleware.js';
import * as auditService from './audit.service.js';

/**
 * Preia lista containere descoperite pentru un server.
 * Suporta filtrare dupa: running, runtime, cautare (name/image).
 */
async function listContainers(serverId, { filter, runtime, search } = {}) {
    const where = { serverId };

    if (filter === 'running') where.running = true;
    if (filter === 'stopped') where.running = false;
    if (runtime && runtime !== 'all') where.runtime = runtime;
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { image: { contains: search, mode: 'insensitive' } },
        ];
    }

    return prisma.discoveredContainer.findMany({
        where,
        orderBy: [{ running: 'desc' }, { name: 'asc' }],
    });
}

/**
 * Preia detalii container dupa ID intern.
 */
async function getContainer(serverId, id) {
    const container = await prisma.discoveredContainer.findFirst({
        where: { serverId, id },
    });

    if (!container) {
        throw new NotFoundError('Container nu a fost gasit');
    }

    return container;
}

/**
 * Procesare inventar containere trimis de agent.
 * Upsert pe baza (serverId, runtime, containerId).
 */
async function submitContainerInventory(serverId, containers) {
    if (!Array.isArray(containers)) {
        throw new BadRequestError('Inventarul trebuie sa fie un array');
    }

    const upserted = [];

    for (const c of containers) {
        if (!c.containerId || !c.runtime) continue;

        try {
            const record = await prisma.discoveredContainer.upsert({
                where: {
                    serverId_runtime_containerId: {
                        serverId,
                        runtime: c.runtime,
                        containerId: c.containerId,
                    },
                },
                create: {
                    serverId,
                    runtime: c.runtime,
                    containerId: c.containerId,
                    name: c.name || c.containerId,
                    image: c.image || 'unknown',
                    imageTag: c.imageTag || null,
                    imageDigest: c.imageDigest || null,
                    status: c.status || 'unknown',
                    running: !!c.running,
                    startedAt: c.startedAt ? new Date(c.startedAt) : null,
                    finishedAt: c.finishedAt ? new Date(c.finishedAt) : null,
                    ports: c.ports || [],
                    mounts: c.mounts || [],
                    restartPolicy: c.restartPolicy || null,
                    networkMode: c.networkMode || null,
                    privileged: !!c.privileged,
                    runningAsRoot: !!c.runningAsRoot,
                    runningAsUser: c.runningAsUser || null,
                    capabilities: c.capabilities || [],
                    seccompProfile: c.seccompProfile || null,
                    appArmorProfile: c.appArmorProfile || null,
                    readOnlyRootfs: !!c.readOnlyRootfs,
                    envVarCount: c.envVarCount ?? null,
                    hasHealthcheck: !!c.hasHealthcheck,
                    labels: c.labels || {},
                    rawInspect: c.rawInspect || null,
                    lastSeenAt: new Date(),
                },
                update: {
                    name: c.name || c.containerId,
                    image: c.image || 'unknown',
                    imageTag: c.imageTag || null,
                    imageDigest: c.imageDigest || null,
                    status: c.status || 'unknown',
                    running: !!c.running,
                    startedAt: c.startedAt ? new Date(c.startedAt) : null,
                    finishedAt: c.finishedAt ? new Date(c.finishedAt) : null,
                    ports: c.ports || [],
                    mounts: c.mounts || [],
                    restartPolicy: c.restartPolicy || null,
                    networkMode: c.networkMode || null,
                    privileged: !!c.privileged,
                    runningAsRoot: !!c.runningAsRoot,
                    runningAsUser: c.runningAsUser || null,
                    capabilities: c.capabilities || [],
                    seccompProfile: c.seccompProfile || null,
                    appArmorProfile: c.appArmorProfile || null,
                    readOnlyRootfs: !!c.readOnlyRootfs,
                    envVarCount: c.envVarCount ?? null,
                    hasHealthcheck: !!c.hasHealthcheck,
                    labels: c.labels || {},
                    rawInspect: c.rawInspect || null,
                    lastSeenAt: new Date(),
                },
            });
            upserted.push(record.id);
        } catch (err) {
            console.error(`Error upserting container ${c.containerId}:`, err.message);
        }
    }

    return { count: upserted.length, message: `${upserted.length} containere actualizate` };
}

/**
 * Porneste un audit de container.
 * Delega catre audit.service.runAudit cu targetType=CONTAINER.
 */
async function runContainerAudit(data, userId) {
    const { serverId, templateId, containerId, targetContainerId, excludedControlIds } = data;
    const cid = containerId || targetContainerId;

    if (!cid) {
        throw new BadRequestError('containerId este obligatoriu pentru auditul de container');
    }

    // Verifica existenta containerului
    const container = await prisma.discoveredContainer.findFirst({
        where: { serverId, id: cid },
    });

    if (!container) {
        throw new NotFoundError('Container nu a fost gasit pe serverul specificat');
    }

    // Ruleaza auditul cu targetType=CONTAINER
    return auditService.runAudit({
        serverId,
        templateId,
        excludedControlIds,
        targetType: 'CONTAINER',
        targetContainerId: cid,
        targetRuntime: container.runtime,
        targetContainerNativeId: container.containerId, // docker/podman container id
    }, userId);
}

/**
 * Preia istoricul auditurilor pentru un container specific.
 */
async function getContainerAuditHistory(serverId, containerId) {
    return prisma.auditRun.findMany({
        where: { serverId, targetContainerId: containerId },
        include: {
            templateVersion: {
                include: {
                    template: { select: { id: true, name: true, type: true } },
                },
            },
            _count: { select: { checkResults: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
}

export {
    listContainers,
    getContainer,
    submitContainerInventory,
    runContainerAudit,
    getContainerAuditHistory,
};
