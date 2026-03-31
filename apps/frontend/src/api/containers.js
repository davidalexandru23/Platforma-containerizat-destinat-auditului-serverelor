import client from './client';

export const getContainers = (serverId, params = {}) =>
    client.get(`/servers/${serverId}/containers`, { params });

export const getContainer = (serverId, containerId) =>
    client.get(`/servers/${serverId}/containers/${containerId}`);

export const refreshContainers = (serverId) =>
    client.post(`/servers/${serverId}/containers/refresh`);

export const getContainerAuditHistory = (serverId, containerId) =>
    client.get(`/servers/${serverId}/containers/${containerId}/audits`);

export const runContainerAudit = (data) =>
    client.post('/audit/run-container', data);
