import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import type { SignUpDetails, Student } from '../model/student';

export async function createOrGetStudentByPhoneNumber(phoneNumber: string): Promise<Student> {
  return prisma.student.upsert({
    where: { phoneNumber },
    create: {
      id: randomUUID(),
      phoneNumber,
      telegramChatId: null,
    },
    update: {},
  });
}

export async function createOrGetStudentByTelegramChatId(telegramChatId: string): Promise<Student> {
  return prisma.student.upsert({
    where: { telegramChatId },
    create: {
      id: randomUUID(),
      phoneNumber: null,
      telegramChatId,
    },
    update: {},
  });
}

export async function persistStudent(student: Student): Promise<Student> {
  return prisma.student.create({
    data: {
      id: student.id,
      phoneNumber: student.phoneNumber,
      telegramChatId: student.telegramChatId,
      name: student.name,
      nativeLanguage: student.nativeLanguage,
      languageToLearn: student.languageToLearn,
    },
  });
}

/** Persists non-null fields from model extraction; no-op if nothing to write. */
export async function mergeStudentProfileFromExtractions(
  studentId: string,
  details: SignUpDetails,
): Promise<Student> {
  const data: { nativeLanguage?: string; languageToLearn?: string; name?: string; email?: string } =
    {};
  if (details.nativeLanguage?.trim()) data.nativeLanguage = details.nativeLanguage.trim();
  if (details.languageToLearn?.trim()) data.languageToLearn = details.languageToLearn.trim();
  if (details.name?.trim()) data.name = details.name.trim();
  if (details.email?.trim()) data.email = details.email.trim();
  if (Object.keys(data).length === 0) {
    return prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  }
  return prisma.student.update({
    where: { id: studentId },
    data,
  });
}
