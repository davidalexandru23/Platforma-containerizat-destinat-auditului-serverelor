// Prisma Client pentru Prisma 7 cu driver adapter PostgreSQL
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Creare adapter PostgreSQL
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL
});

// Instantiere Prisma Client cu adapter
const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
});

export { prisma };
