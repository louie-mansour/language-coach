import {
  completeConversationTurnPrompt,
  type ConversationTurnPayload,
} from '../client/gemeniClient';
import { Intent } from '../model/intent';
import type { Message, SmsMessage } from '../model/message';
import type { SignUpDetails, Student } from '../model/student';
import { studentLanguagesComplete } from '../model/student';

const MAX_PRIOR_MESSAGE_CHARS = 400;
const MIN_CONFIDENCE_FOR_LANG_EXTRACTION = 0.65;
const FALLBACK_REPLY =
  "Thanks! I'm here when you're ready to keep practicing.";

const INTENT_VALUES = new Set<string>(Object.values(Intent));

/** Coach turn likely asked which language the user wants to learn (not native language). */
const COACH_ASKED_TARGET_LANGUAGE_RE =
  /which language|what language|language (do |would |are )?you (want|like|prefer)|want to learn|like to learn|wants? to learn|learn first|pick a language|choose a language|teach you|study\b|studying\b|practice\b/i;

const ENGLISH_REPLY_CUES =
  /\b(please|thanks|thank you|I would|I'd like|I want|yes|ok|okay|sure)\b/i;

/** Substrings for fallback target extraction (lowercase keys → English display name). */
const TARGET_LANG_SPELLING: Record<string, string> = {
  french: 'French',
  spanish: 'Spanish',
  german: 'German',
  italian: 'Italian',
  portuguese: 'Portuguese',
  mandarin: 'Chinese',
  chinese: 'Chinese',
  cantonese: 'Chinese',
  japanese: 'Japanese',
  korean: 'Korean',
  arabic: 'Arabic',
  russian: 'Russian',
  hindi: 'Hindi',
  dutch: 'Dutch',
  polish: 'Polish',
  turkish: 'Turkish',
  greek: 'Greek',
  hebrew: 'Hebrew',
  vietnamese: 'Vietnamese',
  thai: 'Thai',
  swedish: 'Swedish',
  norwegian: 'Norwegian',
  danish: 'Danish',
  finnish: 'Finnish',
  ukrainian: 'Ukrainian',
  czech: 'Czech',
  romanian: 'Romanian',
  hungarian: 'Hungarian',
  indonesian: 'Indonesian',
  tagalog: 'Tagalog',
  filipino: 'Tagalog',
};

export type ProcessIncomingSmsResult = {
  intent: Intent;
  replyToUser: string;
  signUpDetails: SignUpDetails;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function coerceIntent(value: string | undefined): Intent | null {
  if (typeof value !== 'string') return null;
  return INTENT_VALUES.has(value) ? (value as Intent) : null;
}

function emptySignUpDetails(): SignUpDetails {
  return { motherTongue: null, languageToLearn: null, name: null };
}

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function formatPriorMessages(rows: Message[]): string {
  if (rows.length === 0) return '-';
  return rows
    .map((r) => {
      const tag = r.from === 'student' ? 'U' : 'C';
      return `${tag}:${truncateForPrompt(r.message, MAX_PRIOR_MESSAGE_CHARS)}`;
    })
    .join('\n');
}

function lastCoachMessageText(rows: Message[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].from === 'model') {
      const t = rows[i].message?.trim();
      return t && t.length > 0 ? t : null;
    }
  }
  return null;
}

function coachRecentlyAskedTargetLanguage(coachText: string | null): boolean {
  if (!coachText) return false;
  return COACH_ASKED_TARGET_LANGUAGE_RE.test(coachText);
}

function extractTargetLanguageFromUserText(userMessage: string): string | null {
  const lower = userMessage.toLowerCase();
  for (const [needle, display] of Object.entries(TARGET_LANG_SPELLING)) {
    if (new RegExp(`\\b${needle}\\b`, 'i').test(lower)) {
      return display;
    }
  }
  return null;
}

/**
 * User is likely writing in English (so native can be inferred as English when still unknown).
 */
function inferEnglishNativeFromUserMessage(userMessage: string): boolean {
  const m = userMessage.trim();
  if (!m) return false;
  if (ENGLISH_REPLY_CUES.test(m)) return true;
  if (/^[A-Za-z\s,.'!?\-–—]{1,120}$/.test(m) && extractTargetLanguageFromUserText(m)) {
    return true;
  }
  return false;
}

/**
 * Correct common model mistakes: answering "French, please" to "what language to learn?" filed as native.
 */
function applyContextAwareLanguageFixes(
  payload: ConversationTurnPayload,
  student: Student,
  userMessage: string,
  recentMessages: Message[],
): ConversationTurnPayload {
  if (studentLanguagesComplete(student)) {
    return payload;
  }

  const coach = lastCoachMessageText(recentMessages);
  const askedTarget = coachRecentlyAskedTargetLanguage(coach);
  const needTarget = !student.languageToLearn?.trim();
  const needNative = !student.motherTongue?.trim();

  let mother = payload.motherTongue?.trim() || null;
  let motherConf = clamp01(payload.motherTongueConfidence);
  let target = payload.languageToLearn?.trim() || null;
  let targetConf = clamp01(payload.languageToLearnConfidence);

  if (askedTarget && needTarget) {
    const fromUser = extractTargetLanguageFromUserText(userMessage);
    if (fromUser) {
      target = fromUser;
      targetConf = Math.max(targetConf, 0.9);
      if (mother && mother.toLowerCase() === fromUser.toLowerCase()) {
        mother = null;
        motherConf = 0;
      }
    } else if (mother && !target) {
      target = mother;
      targetConf = Math.max(targetConf, motherConf, 0.9);
      mother = null;
      motherConf = 0;
    }
  }

  if (needNative && inferEnglishNativeFromUserMessage(userMessage)) {
    const motherMissingOrDupTarget =
      !mother || (target !== null && mother.toLowerCase() === target.toLowerCase());
    if (motherMissingOrDupTarget) {
      mother = 'English';
      motherConf = Math.max(motherConf, 0.82);
    }
  }

  if (mother && target && mother.toLowerCase() === target.toLowerCase()) {
    if (needNative && inferEnglishNativeFromUserMessage(userMessage)) {
      mother = 'English';
      motherConf = Math.max(motherConf, 0.82);
    } else if (needNative) {
      mother = null;
      motherConf = 0;
    }
  }

  return {
    ...payload,
    motherTongue: mother,
    motherTongueConfidence: motherConf,
    languageToLearn: target,
    languageToLearnConfidence: targetConf,
  };
}

/**
 * Strong, model-visible snapshot so chat history cannot override DB truth.
 */
function buildAuthoritativeProfilePreamble(student: Student): string {
  const native = student.motherTongue?.trim() || '';
  const target = student.languageToLearn?.trim() || '';
  const complete = studentLanguagesComplete(student);

  if (!complete) {
    return `=== AUTHORITATIVE DATABASE PROFILE (read before prior chat) ===
language_setup: INCOMPLETE
native_language_stored: ${native || 'none'}
target_language_stored: ${target || 'none'}
Ask only for what is still missing; do not re-ask for a language already listed above.

`;
  }

  return `=== AUTHORITATIVE DATABASE PROFILE (read before prior chat) ===
language_setup: COMPLETE
native_language_stored: ${native}
target_language_stored: ${target}

HARD RULES — VIOLATING THESE IS A FAILURE:
- Do not ask for native language, mother tongue, first language, or "what language they speak". It is already stored: ${native}.
- Do not ask what language they want to learn or to choose a language. It is already stored: ${target}.
- Ignore any earlier coach (C:) lines in history that ask for languages; those are stale. This block is the source of truth.
- replyToUser must be real coaching/practice in ${target}, not onboarding about languages.

CONVERSATION FLOW (avoid "lesson app" loops):
- The user texting you means they are already here—do not ask "are you ready to start?", "shall we begin the lesson?", "this way to start your lesson", or similar more than once ever in a thread; if you already asked something like that, never repeat it.
- Do not stall on meta-setup. Each reply should add something new: a casual question, a word, a short phrase to try, a reaction to what they said, or light chat—like a friend who speaks ${target}, not a tutorial wizard.
- If their message is messy or mixed languages, go with it and keep the vibe natural.

`;
}

function buildConversationPrompt(
  userMessage: string,
  student: Student,
  priorLines: string,
  lastCoach: string | null,
): string {
  const native = student.motherTongue?.trim() || '';
  const target = student.languageToLearn?.trim() || '';
  const complete = studentLanguagesComplete(student);
  const name = student.name?.trim() || '';

  const askedTargetThisTurn =
    !complete &&
    coachRecentlyAskedTargetLanguage(lastCoach) &&
    !student.languageToLearn?.trim();

  const targetAnswerHint = askedTargetThisTurn
    ? `
Turn context: Your previous coach message asked which language they want to learn (see latest C: line in prior turns). If they answer with only a language name or "Language, please", that is languageToLearn (the language to study)—never put that in motherTongue. motherTongue is only their native/first language. If they wrote in clear English and native_language is unknown, set motherTongue to English with confidence ≥ 0.8. When native_language and target_language are both known after this turn (stored or filled in JSON), write replyToUser mostly in target_language—start real coaching in that language, not in English.
`
    : '';

  const profileBlock = complete
    ? `Profile (stored — already complete; never re-ask unless the user explicitly says they want to change it):
native_language: ${native}
target_language: ${target}
${name ? `name: ${name}` : ''}
Tone: relaxed, friendly, free-flowing—like texting a supportive friend who helps you practice ${target}. Vary what you do each turn; never get stuck repeating the same invitation to "start" or "begin the lesson."
Reply almost entirely in ${target}. Be warm and patient; mistakes are fine—keep the chat moving. Offer at most one small correction when it helps. If they seem lost, briefly use ${native}, then return to an easy ${target} step. Never combine this with questions about which languages they use.`
    : `Profile (partial):
native_language: ${native || 'unknown'}
target_language: ${target || 'unknown'}
${name ? `name: ${name}` : ''}
For JSON extraction: if native_language is already known above, set motherTongue to null and motherTongueConfidence to 0 (do not re-guess). Same for languageToLearn when target_language is already known.
motherTongue = native language only. languageToLearn = language they want to study. Never use the same language name for both unless they explicitly say they are native in the language they are learning (rare in SMS onboarding).
If native or target is still unknown and not clearly inferable from the latest user message (high confidence), ask in a friendly, short way for what is still missing before starting real practice. If you can infer a missing language from their message, set the JSON fields and do not ask for that one. Once both are known (stored or inferred this turn), write replyToUser primarily in languageToLearn—even if the user just wrote in English—mistakes OK, brief native if stuck.
${targetAnswerHint}`;

  return `${buildAuthoritativeProfilePreamble(student)}You are an SMS language coach. Output must match the configured JSON schema (single object, no markdown).

Intent (exactly one string): "chat" | "deleteData" | "signUp"
- "deleteData": user wants their account/data deleted, forgotten, or similar (e.g. GDPR-style). replyToUser = brief, kind confirmation that you will process it. Set language extraction fields to null and confidences to 0.
- "signUp": only for brand-new onboarding tone when there is no useful profile yet; prefer "chat" once you are collecting languages or practicing.
- "chat": default—natural back-and-forth, onboarding when needed, and teaching woven into conversation (not a rigid lesson script).

${profileBlock}

deleteData: keep replyToUser short; no coaching.

General: replyToUser = one concise SMS. When language_setup is COMPLETE, write primarily in target_language_stored and never ask language interview questions.
Free-flow chat: respond to what they actually said; advance the thread with new substance each time. Ban repetitive prompts about being "ready" or "starting the lesson"—if prior turns already nudged them to start, switch to concrete content (vocab, a joke, a question about their day, a tiny challenge, encouragement). During incomplete onboarding, you may match the user's message language until both languages are known.

Extraction fields (English language names, e.g. English, French):
- If language_setup is COMPLETE, set motherTongue and languageToLearn to null with confidence 0 (values already in database; do not re-extract or re-ask).
- Otherwise fill from the latest message and prior context when reasonably confident; use confidence 0 when null.

Prior turns (U=user, C=coach):
${priorLines}

Latest user message:
${truncateForPrompt(userMessage, MAX_PRIOR_MESSAGE_CHARS)}`;
}

function extractionDetailsForMerge(
  payload: ConversationTurnPayload,
  student: Student,
  intent: Intent,
): SignUpDetails {
  const empty = emptySignUpDetails();
  if (intent === Intent.DeleteData) return empty;
  if (studentLanguagesComplete(student)) return empty;

  const motherConf = clamp01(payload.motherTongueConfidence);
  const learnConf = clamp01(payload.languageToLearnConfidence);

  const extractedMother =
    payload.motherTongue?.trim() &&
    motherConf >= MIN_CONFIDENCE_FOR_LANG_EXTRACTION
      ? payload.motherTongue.trim()
      : null;
  const extractedTarget =
    payload.languageToLearn?.trim() &&
    learnConf >= MIN_CONFIDENCE_FOR_LANG_EXTRACTION
      ? payload.languageToLearn.trim()
      : null;

  const details = emptySignUpDetails();
  if (extractedMother && !student.motherTongue?.trim()) {
    details.motherTongue = extractedMother;
  }
  if (extractedTarget && !student.languageToLearn?.trim()) {
    details.languageToLearn = extractedTarget;
  }
  return details;
}

function normalizeIntent(raw: ConversationTurnPayload): Intent {
  const coerced = coerceIntent(raw.intent);
  let intent = coerced ?? Intent.Chat;
  if (intent === Intent.SignUp) {
    intent = Intent.Chat;
  }
  return intent;
}

/**
 * Classifies Chat vs delete-data, drafts the SMS reply, and returns profile fields to merge when
 * native/target languages are still missing in the database.
 */
export async function processIncomingSms(
  incoming: SmsMessage,
  student: Student,
  recentMessages: Message[],
): Promise<ProcessIncomingSmsResult> {
  const lastCoach = lastCoachMessageText(recentMessages);
  const prompt = buildConversationPrompt(
    incoming.message,
    student,
    formatPriorMessages(recentMessages),
    lastCoach,
  );
  const rawPayload = await completeConversationTurnPrompt(prompt);
  const payload = applyContextAwareLanguageFixes(
    rawPayload,
    student,
    incoming.message,
    recentMessages,
  );
  const intent = normalizeIntent(payload);
  const replyToUser =
    payload.replyToUser?.trim().length > 0
      ? payload.replyToUser.trim()
      : FALLBACK_REPLY;
  const signUpDetails = extractionDetailsForMerge(payload, student, intent);

  return { intent, replyToUser, signUpDetails };
}
