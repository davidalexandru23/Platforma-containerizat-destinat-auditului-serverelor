import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    try {
        const containers = await prisma.discoveredContainer.findMany({ select: { id: true, name: true, running: true, status: true } });
        console.log('Containers:', containers);
        
        const templates = await prisma.template.findMany({ select: { name: true, type: true }});
        console.log('Templates:', templates);
    } catch(err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
check();
