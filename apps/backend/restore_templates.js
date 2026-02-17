
import 'dotenv/config';
import { seedTemplates } from './src/services/seeder.service.js';
import { prisma } from './src/lib/prisma.js';
import { log } from './src/lib/logger.js';

async function run() {
    console.log('Restoring templates...');
    try {
        await seedTemplates();
        console.log('Templates restored successfully.');
    } catch (error) {
        console.error('Error executing seed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
