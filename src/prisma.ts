import { PrismaClient } from './generated/prisma';

// Create a single PrismaClient instance per process.
// (In serverless scenarios you'd adapt this pattern accordingly.)
export const prisma = new PrismaClient();

