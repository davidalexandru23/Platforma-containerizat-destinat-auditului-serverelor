import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const templates = await prisma.template.findMany();
  console.log(templates.map(t => ({ id: t.id, name: t.name, type: t.type })));
}
run();
