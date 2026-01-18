const rateLimit = require('express-rate-limit');

// Rate limiter pentru auth
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minut
    max: 10, // 10 requests pe minut
    message: {
        error: 'Too Many Requests',
        message: 'Prea multe incercari, incearca din nou mai tarziu',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter pentru agent
const agentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 1/sec pentru metrics
    message: {
        error: 'Too Many Requests',
        message: 'Rate limit depasit',
    },
    keyGenerator: (req) => {
        // Key bazat pe agent token
        return req.headers['x-agent-token'] || req.ip;
    },
});

// Rate limiter general
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        error: 'Too Many Requests',
        message: 'Prea multe requests',
    },
});

module.exports = {
    authLimiter,
    agentLimiter,
    generalLimiter,
};
