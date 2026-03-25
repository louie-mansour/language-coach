import { randomUUID } from 'crypto';
import type { Student } from '../generated/prisma';
export type { Student } from '../generated/prisma';

export type SignUpDetails = {
  motherTongue: string | null;
  languageToLearn: string | null;
  name: string | null;
};

export function studentLanguagesComplete(
  s: Pick<Student, 'motherTongue' | 'languageToLearn'> | null | undefined,
): boolean {
  return Boolean(s?.motherTongue?.trim() && s?.languageToLearn?.trim());
}

export function studentFactory(student: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>): Student {
    return {
        id: randomUUID(),
        ...student,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}