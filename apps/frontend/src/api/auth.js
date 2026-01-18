import client from './client';

export const authApi = {
    register: async (data) => {
        const response = await client.post('/auth/register', data);
        return response.data;
    },

    login: async (data) => {
        const response = await client.post('/auth/login', data);
        return response.data;
    },

    refresh: async (refreshToken) => {
        const response = await client.post('/auth/refresh', { refreshToken });
        return response.data;
    },

    logout: async () => {
        const response = await client.post('/auth/logout');
        return response.data;
    },
};
