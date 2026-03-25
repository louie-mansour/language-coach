import { randomUUID } from 'crypto';

import type { Prisma } from '../generated/prisma';
import type { Message } from '../model/message';
import { prisma } from '../prisma';

/**
 * Inserts one chat row. Pass `tx` when calling inside `prisma.$transaction`.
 */
export async function persistMessage(
  row: Omit<Message, 'createdAt'>,
  tx?: Prisma.TransactionClient,
): Promise<Message> {
  const db = tx ?? prisma;
  return db.message.create({
    data: {
      id: row.id,
      studentId: row.studentId,
      channel: row.channel,
      from: row.from,
      message: row.message,
    },
  });
}

export async function persistChatTurn(
  studentId: string,
  userMessage: string,
  replyToUser: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await persistMessage(
      {
        id: randomUUID(),
        studentId,
        channel: 'sms',
        from: 'student',
        message: userMessage,
      },
      tx,
    );
    await persistMessage(
      {
        id: randomUUID(),
        studentId,
        channel: 'sms',
        from: 'model',
        message: replyToUser,
      },
      tx,
    );
  });
}

/**
 * Latest chat rows for the SMS channel, oldest-first (suitable for prompt context).
 */
export async function findRecentChatRowsForStudent(
  studentId: string,
  limit: number = 12,
): Promise<Message[]> {
  const recent = await prisma.message.findMany({
    where: { studentId, channel: 'sms' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  recent.reverse();
  return recent;
}
