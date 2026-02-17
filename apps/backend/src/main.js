import 'dotenv/config';

// Corectare serializare BigInt pentru JSON
BigInt.prototype.toJSON = function () {
    return Number(this);
};

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import serversRoutes from './routes/servers.routes.js';
import agentRoutes from './routes/agent.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { setupWebSocket, io as wsIO } from './websocket.js';
import { errorHandler } from './middleware/error.middleware.js';
import { prisma } from './lib/prisma.js';
import { log, requestLogger } from './lib/logger.js';

// Echivalent __dirname pentru ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Configurare WebSocket
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
    },
});

// Middleware securitate
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// Fisiere statice pentru agent
app.use('/downloads', express.static(path.join(__dirname, '../public')));

// Logger cereri
app.use(requestLogger);

// Configurare Swagger
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'BitTrail API',
            version: '1.0.0',
            description: 'API pentru platforma de audit servere',
        },
        servers: [{ url: '/api' }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Verificare stare sistem
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rute API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/audit', auditRoutes);

// Gestionare erori
app.use(errorHandler);

// Initializare WebSocket
setupWebSocket(io);

// Exportare pentru alte module
export { io };

// Pornire server
const PORT = process.env.BACKEND_PORT || 3000;

server.listen(PORT, async () => {
    console.log('Se ruleaza sarcina cleanup audit...'); log.info('=== BitTrail API Server ===');
    console.log('');

    // Verificare conexiune baza de date
    try {
        await prisma.$connect();
        log.success('Database conectata');

        // Initializare sabloane
        const seederService = await import('./services/seeder.service.js');
        await seederService.seedTemplates();

    } catch (error) {
        log.error('Eroare conectare database:', error.message);
    }

    log.info(`Server: http://localhost:${PORT}`);
    log.info(`Swagger: http://localhost:${PORT}/api/docs`);
    log.info(`WebSocket: ws://localhost:${PORT}`);
    console.log('');

    // Pornire sarcina curatare (la 5 minute)
    const auditService = await import('./services/audit.service.js');
    const serversService = await import('./services/servers.service.js');

    // Curatare audituri expirate (la 5 minute)
    setInterval(async () => {
        try {
            const count = await auditService.cleanupStaleAudits();
            if (count > 0) {
                log.info(`[CURATARE] Stergere ${count} audituri vechi`);
            }
        } catch (err) {
            log.error('Eroare job curatare:', err.message);
        }
    }, 5 * 60 * 1000);

    // Verificare servere offline (la 60 secunde)
    // Rulare imediata la pornire pentru curatare statusuri vechi
    try {
        const count = await serversService.checkOfflineServers();
        if (count > 0) {
            log.info(`[STARTUP] Marcare ${count} servere ca OFFLINE`);
        }
    } catch (err) {
        log.error('Eroare verificare startup offline:', err.message);
    }

    setInterval(async () => {
        try {
            const count = await serversService.checkOfflineServers();
            if (count > 0) {
                log.info(`[CURATARE] Marcare ${count} servere ca OFFLINE`);
            }
        } catch (err) {
            log.error('Eroare job verificare offline:', err.message);
        }
    }, 60 * 1000);
});

// Oprire controlata
process.on('SIGTERM', async () => {
    log.warn('SIGTERM primit, oprire...');
    await prisma.$disconnect();
    server.close(() => {
        log.info('Server oprit');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    log.warn('SIGINT primit, oprire...');
    await prisma.$disconnect();
    server.close(() => {
        log.info('Server closed');
        process.exit(0);
    });
});
