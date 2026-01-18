const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Activating Latest Template Versions ---');

    // Get all templates with their versions
    const templates = await prisma.template.findMany({
        include: {
            versions: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    for (const template of templates) {
        if (template.versions.length > 0) {
            const latestVersion = template.versions[0];
            if (!latestVersion.isActive) {
                await prisma.templateVersion.update({
                    where: { id: latestVersion.id },
                    data: { isActive: true }
                });
                console.log(`Activated version ${latestVersion.version} for template "${template.name}"`);
            } else {
                console.log(`Template "${template.name}" already has active version ${latestVersion.version}`);
            }
        } else {
            console.log(`Template "${template.name}" has no versions - skipping.`);
        }
    }

    console.log('\n--- Fixing RUNNING Audits ---');
    const result = await prisma.auditRun.updateMany({
        where: { status: 'RUNNING' },
        data: { status: 'COMPLETED' }
    });
    console.log(`Updated ${result.count} audits from RUNNING to COMPLETED.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
