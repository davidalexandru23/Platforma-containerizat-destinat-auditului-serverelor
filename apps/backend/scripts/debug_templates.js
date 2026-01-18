const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Debugging Templates ---');
    const templates = await prisma.template.findMany({
        include: {
            versions: true // Get all versions, ignore active filter for now
        }
    });

    console.log(`Found ${templates.length} templates.`);
    templates.forEach(t => {
        console.log(`[${t.id}] ${t.name} (Type: ${t.type})`);
        console.log(`  Versions: ${t.versions.length}`);
        t.versions.forEach(v => {
            console.log(`    - v${v.version} (Active: ${v.isActive}, Created: ${v.createdAt})`);
        });
    });

    console.log('\n--- Debugging Inventory ---');
    const servers = await prisma.server.findMany({
        include: {
            inventorySnapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    servers.forEach(s => {
        console.log(`Server: ${s.hostname} (${s.id})`);
        const inv = s.inventorySnapshots[0];
        if (inv) {
            console.log('  Latest Inventory:');
            console.log('  osInfo:', JSON.stringify(inv.osInfo, null, 2));
        } else {
            console.log('  No inventory found.');
        }
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
