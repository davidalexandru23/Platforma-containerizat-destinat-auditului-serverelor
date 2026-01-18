import client from './client';

export const serversApi = {
    getAll: async () => {
        const response = await client.get('/servers');
        return response.data;
    },

    getById: async (id) => {
        const response = await client.get(`/servers/${id}`);
        return response.data;
    },

    create: async (data) => {
        const response = await client.post('/servers', data);
        return response.data;
    },

    update: async (id, data) => {
        const response = await client.put(`/servers/${id}`, data);
        return response.data;
    },

    delete: async (id) => {
        const response = await client.delete(`/servers/${id}`);
        return response.data;
    },

    generateEnrollToken: async (id) => {
        const response = await client.post(`/servers/${id}/enrollToken`);
        return response.data;
    },

    getLatestMetrics: async (id) => {
        const response = await client.get(`/servers/${id}/metrics/latest`);
        return response.data;
    },

    getLatestInventory: async (id) => {
        const response = await client.get(`/servers/${id}/inventory/latest`);
        return response.data;
    },
};
