import { prisma } from '../../src/prisma';

export async function resetDatabase(): Promise<void> {
  await prisma.message.deleteMany();
  await prisma.student.deleteMany();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
