import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        host: true, // Listen on 0.0.0.0 for Docker
        port: 5173,
        watch: {
            usePolling: true, // Needed for Docker volumes on some systems
        },
        proxy: {
            '/api': {
                target: 'http://backend:3000', // Use docker service name
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://backend:3000',
                ws: true,
            },
        },
    },
});
