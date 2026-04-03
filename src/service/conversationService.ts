import {
  completeConversationTurnPrompt,
  type ConversationTurnPayload,
} from '../client/gemeniClient';
import { Intent } from '../model/intent';
import type { Message, SmsMessage } from '../model/message';
import type { SignUpDetails, Student } from '../model/student';
import { studentLanguagesComplete } from '../model/student';

const MAX_PRIOR_CHARS = 400;
const FALLBACK_REPLY =
  "Thanks! I'm here when you're ready to keep practicing.";

/** Product defaults: English native, French is the only language we teach. */
const NATIVE = 'English';
const TARGET = 'French';

export type ProcessIncomingSmsResult = {
  intent: Intent;
  replyToUser: string;
  signUpDetails: SignUpDetails;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatPriorMessages(rows: Message[]): string {
  if (rows.length === 0) return '-';
  return rows
    .map((r) => {
      const tag = r.from === 'student' ? 'U' : 'C';
      return `${tag}:${truncate(r.message, MAX_PRIOR_CHARS)}`;
    })
    .join('\n');
}

function lastCoachMessage(rows: Message[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].from === 'model') {
      const t = rows[i].message?.trim();
      return t && t.length > 0 ? t : null;
    }
  }
  return null;
}

/**
 * User has committed to learning French (only target we support).
 */
function userCommittedToFrench(userMessage: string, lastCoach: string | null): boolean {
  const u = userMessage.trim();
  if (/\bfrench\b|\bfrançais\b|\bfrancais\b/i.test(u)) {
    return true;
  }
  if (
    lastCoach &&
    /french|français|francais|learn (?:this )?language/i.test(lastCoach) &&
    /^\s*(yes|yeah|yep|ok|sure|please|oui)\b/i.test(u)
  ) {
    return true;
  }
  return false;
}

function buildConversationPrompt(
  student: Student,
  priorLines: string,
  userMessage: string,
  channel: 'sms' | 'telegram',
): string {
  const surface = channel === 'telegram' ? 'Telegram' : 'SMS';
  const name = student.name?.trim();
  const nameLine = name ? `The learner goes by ${name}.` : '';
  const complete = studentLanguagesComplete(student);

  const onboardingBlock = !complete
    ? `Onboarding (not yet stored in DB as a full language pair):
- The learner is a native ${NATIVE} speaker (same as everyone in this product).
- You should **ask what language they want to learn** in a natural, friendly way.
- Be honest: this service **only supports ${TARGET}** right now. If they mention another language, kindly say you only offer ${TARGET} here and invite them to try ${TARGET} with you.
- Once they agree to learn ${TARGET} (or say "${TARGET}", "français", etc.), your next turns coach primarily in ${TARGET}; short ${NATIVE} is fine when explaining or if they are stuck.
- Do not skip the "what do you want to learn?" beat on the first exchange unless they already named ${TARGET} in the latest message.
`
    : `Active learner: native ${NATIVE}, studying ${TARGET} (already confirmed in our system).
Coach mostly in ${TARGET}; short ${NATIVE} when helpful. No need to ask which language again unless they explicitly want to change topic.
`;

  return `${nameLine}
${onboardingBlock}
Output must match the configured JSON schema (single object, no markdown).

Intent (exactly one string): "chat" | "deleteData" | "signUp"
- "deleteData": user wants their data/account removed (e.g. GDPR). replyToUser = brief, kind confirmation only.
- "signUp": only for the very first moment of a thread; prefer "chat" once there is any rapport.
- "chat": default.

deleteData: no ${TARGET} practice in reply—just the confirmation.

replyToUser: one concise ${surface} message (short paragraphs are OK on Telegram).

Prior turns (U=user, C=coach):
${priorLines}

Latest user message:
${truncate(userMessage, MAX_PRIOR_CHARS)}`;
}

function intentFromPayload(payload: ConversationTurnPayload): Intent {
  const v = payload.intent;
  if (v === Intent.DeleteData || v === Intent.Chat || v === Intent.SignUp) {
    return v === Intent.SignUp ? Intent.Chat : v;
  }
  return Intent.Chat;
}

function signUpDetailsForTurn(
  intent: Intent,
  student: Student,
  userMessage: string,
  recentMessages: Message[],
): SignUpDetails {
  const empty: SignUpDetails = {
    nativeLanguage: null,
    languageToLearn: null,
    name: null,
  };
  if (intent === Intent.DeleteData) {
    return empty;
  }
  if (studentLanguagesComplete(student)) {
    return empty;
  }

  const out: SignUpDetails = { ...empty };
  if (!student.nativeLanguage?.trim()) {
    out.nativeLanguage = NATIVE;
  }
  if (
    !student.languageToLearn?.trim() &&
    userCommittedToFrench(userMessage, lastCoachMessage(recentMessages))
  ) {
    out.languageToLearn = TARGET;
  }

  if (!out.nativeLanguage && !out.languageToLearn) {
    return empty;
  }
  return out;
}

/**
 * One turn: Gemini returns intent + reply; DB gets English / French when the user has committed.
 */
export async function processIncomingSms(
  incoming: Pick<SmsMessage, 'message'>,
  student: Student,
  recentMessages: Message[],
  channel: 'sms' | 'telegram',
): Promise<ProcessIncomingSmsResult> {
  const prompt = buildConversationPrompt(
    student,
    formatPriorMessages(recentMessages),
    incoming.message,
    channel,
  );
  const payload = await completeConversationTurnPrompt(prompt);
  const intent = intentFromPayload(payload);
  const replyToUser =
    payload.replyToUser?.trim().length > 0
      ? payload.replyToUser.trim()
      : FALLBACK_REPLY;

  return {
    intent,
    replyToUser,
    signUpDetails: signUpDetailsForTurn(
      intent,
      student,
      incoming.message,
      recentMessages,
    ),
  };
}
