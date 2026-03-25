import { prisma } from '../prisma';

/**
 * Removes the student and all related messages in one transaction.
 * No-op if no student exists for the phone number.
 */
export async function deleteStudentData(studentId: string | null): Promise<void> {
  if (!studentId) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) {
      return;
    }

    await tx.message.deleteMany({ where: { studentId: student.id } });
    await tx.student.delete({ where: { id: student.id } });
  });
}
