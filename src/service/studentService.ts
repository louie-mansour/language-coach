import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import type { SignUpDetails, Student } from '../model/student';

export async function createOrGetStudentByPhoneNumber(phoneNumber: string): Promise<Student> {
  return prisma.student.upsert({
    where: { phoneNumber },
    create: {
      id: randomUUID(),
      phoneNumber,
    },
    update: {},
  });
}


export async function persistStudent(student: Student): Promise<Student> {
  return prisma.student.create({
    data: {
      id: student.id,
      phoneNumber: student.phoneNumber,
      name: student.name,
      motherTongue: student.motherTongue,
      languageToLearn: student.languageToLearn,
    },
  });
}

/** Persists non-null fields from model extraction; no-op if nothing to write. */
export async function mergeStudentProfileFromExtractions(
  studentId: string,
  details: SignUpDetails,
): Promise<Student> {
  const data: { motherTongue?: string; languageToLearn?: string; name?: string } = {};
  if (details.motherTongue?.trim()) data.motherTongue = details.motherTongue.trim();
  if (details.languageToLearn?.trim()) data.languageToLearn = details.languageToLearn.trim();
  if (details.name?.trim()) data.name = details.name.trim();
  if (Object.keys(data).length === 0) {
    return prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  }
  return prisma.student.update({
    where: { id: studentId },
    data,
  });
}
