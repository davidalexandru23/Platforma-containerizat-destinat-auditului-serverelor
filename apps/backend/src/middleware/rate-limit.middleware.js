import rateLimit from 'express-rate-limit';

// Limitare rata pentru autentificare
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minut
    max: 10, // 10 cereri pe minut
    message: {
        error: 'Too Many Requests',
        message: 'Prea multe incercari, incearca din nou mai tarziu',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Limitare rata pentru agent
const agentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 1/sec pentru metrici
    message: {
        error: 'Too Many Requests',
        message: 'Rate limit depasit',
    },
    keyGenerator: (req) => {
        // Cheie bazata pe token agent
        return req.headers['x-agent-token'] || req.ip;
    },
});

// Limitare rata generala
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        error: 'Too Many Requests',
        message: 'Prea multe cereri',
    },
});

export {
    authLimiter,
    agentLimiter,
    generalLimiter,
};
