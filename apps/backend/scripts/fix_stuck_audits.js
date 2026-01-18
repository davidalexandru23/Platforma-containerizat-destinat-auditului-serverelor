const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Cleaning Stuck Audits ---');

    const result = await prisma.auditRun.updateMany({
        where: {
            status: 'RUNNING'
        },
        data: {
            status: 'FAILED',
            // optionally add a note like 'marked as failed by system cleanup' if schema supported it
        }
    });

    console.log(`Updated ${result.count} running audits to FAILED.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
