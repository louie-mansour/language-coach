import { randomUUID } from 'crypto';

import type { Prisma } from '../generated/prisma';
import type { Message } from '../model/message';
import { prisma } from '../prisma';

export type ChatChannel = 'sms' | 'telegram';

/** Channels included in end-of-day digest transcript. */
export const DIGEST_CHAT_CHANNELS: ChatChannel[] = ['sms', 'telegram'];

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
  channel: ChatChannel,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await persistMessage(
      {
        id: randomUUID(),
        studentId,
        channel,
        from: 'student',
        message: userMessage,
      },
      tx,
    );
    await persistMessage(
      {
        id: randomUUID(),
        studentId,
        channel,
        from: 'model',
        message: replyToUser,
      },
      tx,
    );
  });
}

/**
 * Latest chat rows for the given channel, oldest-first (suitable for prompt context).
 */
export async function findRecentChatRowsForStudent(
  studentId: string,
  limit: number = 12,
  channel: ChatChannel = 'sms',
): Promise<Message[]> {
  const recent = await prisma.message.findMany({
    where: { studentId, channel },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  recent.reverse();
  return recent;
}

/**
 * All digest-eligible chat rows for a student whose createdAt falls in [start, end) (typically one UTC calendar day).
 */
export async function findMessagesForStudentInTimeRange(
  studentId: string,
  start: Date,
  end: Date,
): Promise<Message[]> {
  return prisma.message.findMany({
    where: {
      studentId,
      channel: { in: DIGEST_CHAT_CHANNELS },
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: 'asc' },
  });
}
