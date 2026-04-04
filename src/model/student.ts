import { randomUUID } from 'crypto';
import type { Student } from '../generated/prisma';
export type { Student } from '../generated/prisma';

export type SignUpDetails = {
  nativeLanguage: string | null;
  languageToLearn: string | null;
  name: string | null;
  email: string | null;
};

export function studentLanguagesComplete(
  s: Pick<Student, 'nativeLanguage' | 'languageToLearn'> | null | undefined,
): boolean {
  return Boolean(s?.nativeLanguage?.trim() && s?.languageToLearn?.trim());
}

export function studentFactory(student: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>): Student {
    return {
        id: randomUUID(),
        ...student,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}