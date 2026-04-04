import { randomUUID } from 'crypto';

import { completeDailyDigestPrompt } from '../client/gemeniClient';
import { sendHtmlEmail, isEmailConfigured } from '../client/emailClient';
import { isTelegramConfigured, sendTelegramMessage } from '../client/telegramClient';
import type { Student } from '../model/student';
import { prisma } from '../prisma';
import { utcDateString, utcLast24HoursBounds } from '../util/utcDate';
import { findMessagesForStudentInTimeRange } from '../service/chatService';
import type { Message } from '../model/message';

const MAX_LINE_CHARS = 1200;

export type DailyDigestRunSummary = {
  /** UTC calendar date when the digest run started (for subject lines / labels). Window is always the prior 24 hours. */
  digestUtcDate: string;
  /** Students with email (digest email path). */
  studentsConsidered: number;
  emailsSent: number;
  /**
   * "Add your email" Telegram DM for learners **without** email on file who had chat activity
   * that UTC day. If you have email, you are not in this path — see `emailsSent` / email skips.
   */
  telegramNudgesSent: number;
  skippedNoMessages: number;
  skippedDigestDeclined: number;
  skippedEmailNotConfigured: number;
  skippedTelegramNotConfigured: number;
  /** No-email learners with `telegramChatId`: no messages in the last 24 hours. */
  telegramNudgeSkippedNoMessages: number;
  /** No-email learners: messages that day but no `telegramChatId` (unusual for Telegram users). */
  telegramNudgeSkippedNoTelegramChat: number;
  /**
   * Had messages in the window but no qualifying student message: either no user turns in the window,
   * or a digest was already sent and the learner has not sent a new message since `lastDigestSentAt`.
   */
  skippedDigestNoNewStudentMessage: number;
  failures: { studentId: string; message: string }[];
};

/** Shown to learners who practiced on Telegram but have no email on file yet. */
const EMAIL_DIGEST_INVITE_TELEGRAM =
  'Add your email to your profile to get a daily digest of your wins and improvements in the language. Reply here if you want help setting it up.';

function truncateLine(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Email digest only if the learner sent at least one message in the window, and — when a prior
 * digest was sent — at least one student message strictly after `lastDigestSentAt`.
 */
export function shouldSendEmailDigest(
  rows: Message[],
  lastDigestSentAt: Date | null,
): boolean {
  if (lastDigestSentAt == null) {
    return rows.some((r) => r.from === 'student');
  }
  return rows.some(
    (r) => r.from === 'student' && r.createdAt > lastDigestSentAt,
  );
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

  return `You are preparing a private email for ${name} covering their last 24 hours of practice (window ending ${digestUtcDateLabel} UTC).
They are studying ${target}; native language context: ${native}.

You only have the chat transcript below (SMS and/or Telegram). Lines use U: = user, C: = coach.
Rules:
- Pick up to 3 strengths: natural phrasing, good vocabulary, confidence, or small wins—sound human, not generic praise.
- Pick up to 3 improvements: gentle, specific, actionable—like a supportive friend, not a harsh correction list.
- Do not say "summary", "digest", or "AI". Write as if a thoughtful coach is reflecting on their recent practice.
- If the window was only onboarding, account setup, delete-data, or there was no real practice in ${target}, set shouldSend to false and use empty arrays.

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
<p style="margin-top: 2rem; font-size: 0.875rem; color: #444;">You did not see this during your chat — it is a reflection on your recent practice.</p>
</body></html>`;
}

/**
 * Reads each student's messages from the last 24 hours (now − 24h through now), asks Gemini for strengths/improvements, emails if configured.
 * Each successful email creates a `DigestSend` row (strengths/improvements + window) for analytics; `Student.lastDigestSentAt` gates back-to-back sends.
 * Learners without an email who had Telegram activity get a Telegram message inviting them to add email for the digest.
 */
export async function runDailyDigestForAllStudents(): Promise<DailyDigestRunSummary> {
  const now = new Date();
  const { start, end } = utcLast24HoursBounds(now);
  const dateStr = utcDateString(now);

  const summary: DailyDigestRunSummary = {
    digestUtcDate: dateStr,
    studentsConsidered: 0,
    emailsSent: 0,
    telegramNudgesSent: 0,
    skippedNoMessages: 0,
    skippedDigestDeclined: 0,
    skippedEmailNotConfigured: 0,
    skippedTelegramNotConfigured: 0,
    telegramNudgeSkippedNoMessages: 0,
    telegramNudgeSkippedNoTelegramChat: 0,
    skippedDigestNoNewStudentMessage: 0,
    failures: [],
  };

  const emailReady = isEmailConfigured();
  const telegramReady = isTelegramConfigured();

  const students = await prisma.student.findMany({
    select: {
      id: true,
      telegramChatId: true,
      email: true,
      name: true,
      nativeLanguage: true,
      languageToLearn: true,
      lastDigestSentAt: true,
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

        if (!shouldSendEmailDigest(rows, student.lastDigestSentAt)) {
          summary.skippedDigestNoNewStudentMessage += 1;
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
        await prisma.$transaction([
          prisma.digestSend.create({
            data: {
              id: randomUUID(),
              studentId: student.id,
              sentAt: now,
              windowStart: start,
              windowEnd: end,
              strengths: digest.strengths,
              improvements: digest.improvements,
            },
          }),
          prisma.student.update({
            where: { id: student.id },
            data: { lastDigestSentAt: now },
          }),
        ]);
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
        if (student.telegramChatId?.trim()) {
          summary.telegramNudgeSkippedNoMessages += 1;
        }
        continue;
      }

      const chatId = student.telegramChatId?.trim();
      if (!chatId) {
        summary.telegramNudgeSkippedNoTelegramChat += 1;
        continue;
      }

      if (!telegramReady) {
        summary.skippedTelegramNotConfigured += 1;
        continue;
      }

      await sendTelegramMessage({ chatId, text: EMAIL_DIGEST_INVITE_TELEGRAM });
      summary.telegramNudgesSent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failures.push({ studentId: student.id, message });
    }
  }

  return summary;
}
