// logger simplu pentru depanare
const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('ro-RO', { hour12: false });
};

const log = {
    info: (msg, ...args) => {
        console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.blue}INFO${colors.reset} ${msg}`, ...args);
    },

    success: (msg, ...args) => {
        console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.green}OK${colors.reset} ${msg}`, ...args);
    },

    warn: (msg, ...args) => {
        console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.yellow}WARN${colors.reset} ${msg}`, ...args);
    },

    error: (msg, ...args) => {
        console.log(`${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.red}ERR${colors.reset} ${msg}`, ...args);
    },

    api: (method, path, status, duration) => {
        const statusColor = status >= 400 ? colors.red : status >= 300 ? colors.yellow : colors.green;
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.cyan}API${colors.reset} ${method.padEnd(6)} ${path} ${statusColor}${status}${colors.reset} ${colors.dim}${duration}ms${colors.reset}`
        );
    },

    ws: (namespace, event, ...args) => {
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.magenta}WS${colors.reset} ${namespace} ${colors.dim}${event}${colors.reset}`,
            ...args
        );
    },

    db: (operation, model, duration) => {
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.green}DB${colors.reset} ${operation} ${model} ${colors.dim}${duration}ms${colors.reset}`
        );
    },

    agent: (serverId, action, ...args) => {
        const shortId = serverId?.substring(0, 8) || 'unknown';
        console.log(
            `${colors.dim}[${getTimestamp()}]${colors.reset} ${colors.yellow}AGENT${colors.reset} [${shortId}] ${action}`,
            ...args
        );
    },
};

// Middleware pentru logger cereri HTTP
const requestLogger = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        log.api(req.method, req.originalUrl, res.statusCode, duration);
    });

    next();
};

export { log, requestLogger };
