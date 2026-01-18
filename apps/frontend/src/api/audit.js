import client from './client';

export const auditApi = {
    getAll: async (serverId = null) => {
        const params = serverId ? { serverId } : {};
        const response = await client.get('/audit', { params });
        return response.data;
    },

    getById: async (id) => {
        const response = await client.get(`/audit/${id}`);
        return response.data;
    },

    getProgress: async (id) => {
        const response = await client.get(`/audit/${id}/progress`);
        return response.data;
    },

    run: async (data) => {
        const response = await client.post('/audit/run', data);
        return response.data;
    },

    complete: async (id) => {
        const response = await client.post(`/audit/${id}/complete`);
        return response.data;
    },

    submitEvidence: async (runId, taskId, formData) => {
        const response = await client.post(
            `/audit/${runId}/manual/${taskId}/evidence`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return response.data;
    },

    approveTask: async (runId, taskId, approved, notes = '') => {
        const response = await client.post(`/audit/${runId}/manual/${taskId}/approve`, {
            approved,
            notes,
        });
        return response.data;
    },
};
