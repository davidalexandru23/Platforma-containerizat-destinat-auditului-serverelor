// Middleware pentru gestionare erori centralizata
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Erori de validare
    if (err.name === 'ValidationError' || err.type === 'validation') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            details: err.details || [],
        });
    }

    // Erori Prisma
    if (err.code === 'P2002') {
        return res.status(409).json({
            error: 'Conflict',
            message: 'Resursa exista deja',
        });
    }

    if (err.code === 'P2025') {
        return res.status(404).json({
            error: 'Not Found',
            message: 'Resursa nu exista',
        });
    }

    // Erori personalizate
    if (err.statusCode) {
        const response = {
            error: err.name || 'Error',
            message: err.message,
        };
        // Propagare erori validare comenzi catre frontend
        if (err.commandErrors) {
            response.commandErrors = err.commandErrors;
        }
        return res.status(err.statusCode).json(response);
    }

    // Eroare generica
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Eroare interna',
    });
};

// Clasa pentru erori personalizate
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resursa nu exista') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Neautorizat') {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Acces interzis') {
        super(message, 403);
        this.name = 'ForbiddenError';
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflict') {
        super(message, 409);
        this.name = 'ConflictError';
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Request invalid') {
        super(message, 400);
        this.name = 'BadRequestError';
    }
}

export {
    errorHandler,
    AppError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    BadRequestError,
};
