import client from './client';

export const templatesApi = {
    getAll: async () => {
        const response = await client.get('/templates');
        return response.data;
    },

    getById: async (id) => {
        const response = await client.get(`/templates/${id}`);
        return response.data;
    },

    create: async (data) => {
        const response = await client.post('/templates', data);
        return response.data;
    },

    importJson: async (jsonData) => {
        const response = await client.post('/templates/importJson', jsonData);
        return response.data;
    },

    validateJson: async (jsonData) => {
        const response = await client.post('/templates/validateJson', jsonData);
        return response.data;
    },

    exportJson: async (id) => {
        const response = await client.get(`/templates/${id}/exportJson`);
        return response.data;
    },

    getActiveVersion: async (id) => {
        const response = await client.get(`/templates/${id}/activeVersion`);
        return response.data;
    },

    delete: async (id) => {
        const response = await client.delete(`/templates/${id}`);
        return response.data;
    },
};
