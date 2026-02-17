
import 'dotenv/config';
import { prisma } from './src/lib/prisma.js';

async function run() {
    console.log('Checking DB templates...');
    const templates = await prisma.template.findMany({
        include: { versions: true }
    });

    console.log(`Found ${templates.length} templates:`);
    templates.forEach(t => {
        console.log(`- [${t.id}] "${t.name}" (Type: ${t.type}, BuiltIn: ${t.isBuiltIn})`);
        console.log(`  Versions: ${t.versions.length} (${t.versions.filter(v => v.isActive).length} active)`);
        t.versions.forEach(v => console.log(`    v${v.version} (Active: ${v.isActive})`));
    });

    await prisma.$disconnect();
}

run();
