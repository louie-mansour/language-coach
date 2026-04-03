import { completeDailyDigestPrompt } from '../client/gemeniClient';
import { sendHtmlEmail, isEmailConfigured } from '../client/emailClient';
import { isSmsConfigured, sendSms } from '../client/smsClient';
import type { Student } from '../model/student';
import { prisma } from '../prisma';
import { utcDayBounds, utcYesterdayDateString } from '../util/utcDate';
import { findMessagesForStudentInTimeRange } from '../service/chatService';
import type { Message } from '../model/message';

const MAX_LINE_CHARS = 1200;

export type DailyDigestRunSummary = {
  digestUtcDate: string;
  studentsConsidered: number;
  emailsSent: number;
  smsNudgesSent: number;
  skippedNoMessages: number;
  skippedDigestDeclined: number;
  skippedEmailNotConfigured: number;
  skippedSmsNotConfigured: number;
  failures: { studentId: string; message: string }[];
};

/** Shown to learners who practiced (SMS) but have no email on file yet. */
const EMAIL_DIGEST_INVITE_SMS =
  'Add your email to your profile to get a daily digest of your wins and improvements in the language. Reply here if you want help setting it up.';

function truncateLine(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function formatTranscriptForDigest(messages: Message[]): string {
  if (messages.length === 0) return '(no messages)';
  return messages
    .map((r) => {
      const tag = r.from === 'student' ? 'U' : 'C';
      return `${tag}:${truncateLine(r.message, MAX_LINE_CHARS)}`;
    })
    .join('\n');
}

function buildDailyDigestPrompt(
  transcript: string,
  student: Pick<Student, 'name' | 'nativeLanguage' | 'languageToLearn'>,
  digestUtcDateLabel: string,
): string {
  const native = student.nativeLanguage?.trim() || 'unknown';
  const target = student.languageToLearn?.trim() || 'unknown';
  const name = student.name?.trim() || 'the learner';

  return `You are preparing a private end-of-day email for ${name} (${digestUtcDateLabel}, UTC calendar day).
They are studying ${target}; native language context: ${native}.

You only have the chat transcript below (SMS and/or Telegram). Lines use U: = user, C: = coach.
Rules:
- Pick up to 3 strengths: natural phrasing, good vocabulary, confidence, or small wins—sound human, not generic praise.
- Pick up to 3 improvements: gentle, specific, actionable—like a supportive friend, not a harsh correction list.
- Do not say "summary", "digest", or "AI". Write as if a thoughtful coach is reflecting on their day.
- If the day was only onboarding, account setup, delete-data, or there was no real practice in ${target}, set shouldSend to false and use empty arrays.

Transcript:
${transcript}`;
}

function buildDigestHtml(digestUtcDate: string, strengths: string[], improvements: string[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const list = (items: string[]) =>
    items.length === 0
      ? '<p>—</p>'
      : `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

  return `<!DOCTYPE html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
<h1 style="font-size: 1.25rem;">Your practice — ${esc(digestUtcDate)}</h1>
<h2 style="font-size: 1rem; margin-top: 1.5rem;">What went well</h2>
${list(strengths)}
<h2 style="font-size: 1rem; margin-top: 1.5rem;">Ways to grow</h2>
${list(improvements)}
<p style="margin-top: 2rem; font-size: 0.875rem; color: #444;">You did not see this during your chat — it is an end-of-day reflection.</p>
</body></html>`;
}

/**
 * Reads each student's SMS rows for the UTC day, asks Gemini for strengths/improvements, emails if configured.
 * Learners without an email who had SMS activity get a short SMS inviting them to add email for the digest.
 * No separate DB rows for "mistakes" or "wins" — only message history + optional Student.email.
 */
export async function runDailyDigestForAllStudents(
  digestUtcDate?: string,
): Promise<DailyDigestRunSummary> {
  const dateStr = digestUtcDate?.trim() || utcYesterdayDateString();
  const { start, end } = utcDayBounds(dateStr);

  const summary: DailyDigestRunSummary = {
    digestUtcDate: dateStr,
    studentsConsidered: 0,
    emailsSent: 0,
    smsNudgesSent: 0,
    skippedNoMessages: 0,
    skippedDigestDeclined: 0,
    skippedEmailNotConfigured: 0,
    skippedSmsNotConfigured: 0,
    failures: [],
  };

  const emailReady = isEmailConfigured();
  const smsReady = isSmsConfigured();

  const students = await prisma.student.findMany({
    select: {
      id: true,
      phoneNumber: true,
      email: true,
      name: true,
      nativeLanguage: true,
      languageToLearn: true,
    },
  });

  const withEmail = students.filter((s) => s.email && s.email.trim().length > 0);
  const withoutEmail = students.filter((s) => !s.email || !s.email.trim());
  summary.studentsConsidered = withEmail.length;

  if (emailReady) {
    for (const student of withEmail) {
      const email = student.email!.trim();
      try {
        const rows = await findMessagesForStudentInTimeRange(student.id, start, end);
        if (rows.length === 0) {
          summary.skippedNoMessages += 1;
          continue;
        }

        const transcript = formatTranscriptForDigest(rows);
        const prompt = buildDailyDigestPrompt(transcript, student, dateStr);
        const digest = await completeDailyDigestPrompt(prompt);

        if (!digest.shouldSend) {
          summary.skippedDigestDeclined += 1;
          continue;
        }

        const subject = `Your language practice — ${dateStr}`;
        const html = buildDigestHtml(dateStr, digest.strengths, digest.improvements);
        await sendHtmlEmail({ to: email, subject, html });
        summary.emailsSent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary.failures.push({ studentId: student.id, message });
      }
    }
  } else {
    summary.skippedEmailNotConfigured = withEmail.length;
  }

  for (const student of withoutEmail) {
    try {
      const rows = await findMessagesForStudentInTimeRange(student.id, start, end);
      if (rows.length === 0) {
        continue;
      }

      const phone = student.phoneNumber?.trim();
      if (!phone) {
        continue;
      }

      if (!smsReady) {
        summary.skippedSmsNotConfigured += 1;
        continue;
      }

      await sendSms({ to: phone, body: EMAIL_DIGEST_INVITE_SMS });
      summary.smsNudgesSent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failures.push({ studentId: student.id, message });
    }
  }

  return summary;
}
