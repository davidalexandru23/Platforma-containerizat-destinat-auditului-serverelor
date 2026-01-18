const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Updating RUNNING Audits to COMPLETED ---');

    const result = await prisma.auditRun.updateMany({
        where: { status: 'RUNNING' },
        data: { status: 'COMPLETED' }
    });
    console.log(`Updated ${result.count} audits.`);

    console.log('\n--- Active Templates Check ---');
    const templates = await prisma.template.findMany({
        include: {
            versions: {
                where: { isActive: true },
                take: 1
            }
        }
    });
    console.log(`Templates with active versions: ${templates.filter(t => t.versions.length > 0).length}`);
    templates.forEach(t => {
        console.log(`- ${t.name}: ${t.versions.length > 0 ? 'HAS ACTIVE VERSION' : 'NO ACTIVE VERSION'}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
