const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting rebranding migration (BitTrace -> BitTrail)...');

    // 1. Update Users emails
    // Search for users with @bittrace.io
    const users = await prisma.user.findMany({
        where: { email: { contains: 'bittrace.io' } }
    });

    console.log(`Found ${users.length} users with old branding email.`);

    for (const user of users) {
        const newEmail = user.email.replace('bittrace.io', 'bittrail.io');
        try {
            await prisma.user.update({
                where: { id: user.id },
                data: { email: newEmail }
            });
            console.log(`Updated user ${user.id}: ${user.email} -> ${newEmail}`);
        } catch (err) {
            console.error(`Failed to update user ${user.email}: ${err.message}`);
        }
    }

    // 2. Update Templates
    // Assuming model name is 'template' (from routes inspection) or 'Template'
    // and fields 'name', 'description'
    try {
        // Model name is Template -> prisma.template
        const templateModel = prisma.template;

        if (!templateModel) {
            console.log('Template model not found on Prisma Client. Skipping templates update.');
        } else {
            const templates = await templateModel.findMany({
                where: {
                    OR: [
                        { name: { contains: 'BitTrace', mode: 'insensitive' } },
                        { description: { contains: 'BitTrace', mode: 'insensitive' } }
                    ]
                }
            });

            console.log(`Found ${templates.length} templates with old branding.`);

            for (const t of templates) {
                const newName = t.name.replace(/BitTrace/gi, 'BitTrail');
                const newDesc = t.description ? t.description.replace(/BitTrace/gi, 'BitTrail') : null;

                await templateModel.update({
                    where: { id: t.id },
                    data: { name: newName, description: newDesc }
                });
                console.log(`Updated template ${t.id}: ${t.name} -> ${newName}`);
            }
        }
    } catch (e) {
        console.log('Templates update skipped or failed:', e.message);
    }

    console.log('Migration finished.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
