require('dotenv').config({ path: ['.env', '../../.env'] });


// fix serializare BigInt pt JSON
BigInt.prototype.toJSON = function () {
    return Number(this);
};

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const serversRoutes = require('./routes/servers.routes');
const agentRoutes = require('./routes/agent.routes');
const templatesRoutes = require('./routes/templates.routes');
const auditRoutes = require('./routes/audit.routes');
const { setupWebSocket } = require('./websocket');
const { errorHandler } = require('./middleware/error.middleware');
const { prisma } = require('./lib/prisma');
const { log, requestLogger } = require('./lib/logger');

const app = express();
const server = http.createServer(app);

// config WebSocket
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
    },
});

// middleware securitate
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

// fisiere statice pt agent
const path = require('path');
app.use('/downloads', express.static(path.join(__dirname, '../public')));

// logger requesturi
app.use(requestLogger);

// config swagger
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

// health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// rute
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/audit', auditRoutes);

// handler erori
app.use(errorHandler);

// init websocket
setupWebSocket(io);

// export pt alte module
module.exports = { io };

// pornire server
const PORT = process.env.BACKEND_PORT || 3000;

server.listen(PORT, async () => {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║           BitTrail API Server              ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');

    // check conexiune db
    try {
        await prisma.$connect();
        log.success('Database conectata');

        // seed templateuri
        const seederService = require('./services/seeder.service');
        await seederService.seedTemplates();

    } catch (error) {
        log.error('Eroare conectare database:', error.message);
    }

    log.info(`Server: http://localhost:${PORT}`);
    log.info(`Swagger: http://localhost:${PORT}/api/docs`);
    log.info(`WebSocket: ws://localhost:${PORT}`);
    console.log('');
});

// oprire gratiosa
process.on('SIGTERM', async () => {
    log.warn('SIGTERM received, closing...');
    await prisma.$disconnect();
    server.close(() => {
        log.info('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    log.warn('SIGINT received, closing...');
    await prisma.$disconnect();
    server.close(() => {
        log.info('Server closed');
        process.exit(0);
    });
});
