import { z } from 'zod';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const geminiPartSchema = z
  .object({
    text: z.string().optional(),
  })
  .passthrough();

const geminiContentSchema = z
  .object({
    parts: z.array(geminiPartSchema).optional(),
  })
  .passthrough();

const geminiCandidateSchema = z
  .object({
    content: geminiContentSchema.optional(),
    finishReason: z.string().optional(),
  })
  .passthrough();

const geminiGenerateResponseSchema = z
  .object({
    candidates: z.array(geminiCandidateSchema).optional(),
    error: z
      .object({
        message: z.string(),
        code: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/**
 * Single structured response: routing (intent) + user-facing SMS + optional sign-up extraction.
 * When using Gemini `responseJsonSchema`, every key is always present (null/0 when unknown).
 */
export const conversationTurnPayloadSchema = z
  .object({
    intent: z.string(),
    intentConfidence: z.coerce.number(),
    replyToUser: z.string(),
    motherTongue: z.string().nullable(),
    motherTongueConfidence: z.coerce.number(),
    languageToLearn: z.string().nullable(),
    languageToLearnConfidence: z.coerce.number(),
  })
  .passthrough();

export type ConversationTurnPayload = z.infer<typeof conversationTurnPayloadSchema>;

/**
 * Forces Gemini to emit all keys (models often omit optional fields with JSON mime type only).
 * See https://ai.google.dev/gemini-api/docs/structured-output
 */
export const conversationTurnResponseJsonSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      description: 'Exactly one of: signUp, chat, deleteData',
    },
    intentConfidence: {
      type: 'number',
      description: 'Confidence between 0 and 1 for the intent value.',
    },
    replyToUser: {
      type: 'string',
      description:
        'Short SMS, natural and varied—like texting a friend. If the system prompt says both languages are stored (COMPLETE), write mainly in the target language and do not repeat "ready to start the lesson?" style prompts; give concrete new content each turn. Otherwise match the user language during onboarding until both are known.',
    },
    motherTongue: {
      type: ['string', 'null'],
      description:
        'Native/first language only (English name). Never put the language they want to learn here. If the user only names a study language (e.g. after you asked what they want to learn), that belongs in languageToLearn, not here.',
    },
    motherTongueConfidence: {
      type: 'number',
      description: '0 if motherTongue is null; otherwise 0–1 confidence.',
    },
    languageToLearn: {
      type: ['string', 'null'],
      description:
        'Language they want to learn/study (English name, e.g. French). If your previous turn asked what language to learn and they answer with just a language (e.g. "French, please"), put it here—not in motherTongue.',
    },
    languageToLearnConfidence: {
      type: 'number',
      description: '0 if languageToLearn is null; otherwise 0–1 confidence.',
    },
  },
  required: [
    'intent',
    'intentConfidence',
    'replyToUser',
    'motherTongue',
    'motherTongueConfidence',
    'languageToLearn',
    'languageToLearnConfidence',
  ],
} as const;

function extractModelJsonText(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) return fence[1].trim();
  return trimmed;
}

function buildGenerateContentUrl(model: string, apiKey: string): string {
  const path = `models/${encodeURIComponent(model)}:generateContent`;
  return `${GEMINI_API_BASE}/${path}?key=${encodeURIComponent(apiKey)}`;
}

type GeminiGenerateBody = {
  contents: { role: string; parts: { text: string }[] }[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig: {
    temperature: number;
    responseMimeType?: string;
    /** Caps completion length (output tokens are billed). */
    maxOutputTokens?: number;
    /** Gemini structured outputs: all required properties are always returned. */
    responseJsonSchema?: object;
  };
};

async function fetchGeminiGenerate(body: GeminiGenerateBody): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite';
  const url = buildGenerateContentUrl(model, apiKey);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const rawBody = await res.text();
  let payload: unknown;
  if (rawBody.length === 0) {
    throw new Error(
      `Gemini API returned an empty body (HTTP ${res.status}). Check GEMINI_API_KEY, network, and GEMINI_MODEL (${model}).`,
    );
  }
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error(
      `Gemini API returned non-JSON (HTTP ${res.status}): ${rawBody.slice(0, 500)}`,
    );
  }

  const parsedResponse = geminiGenerateResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new Error(
      `Invalid Gemini API JSON: ${JSON.stringify(parsedResponse.error.format())}`,
    );
  }
  const data = parsedResponse.data;

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    throw new Error(`Gemini API error (${res.status}): ${msg}`);
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('') ?? '';

  if (!text) {
    const reason = data.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`Gemini returned no text (finishReason=${reason})`);
  }

  return text;
}

/**
 * One call: intent + SMS reply + optional sign-up fields (JSON mode).
 */
export async function completeConversationTurnPrompt(
  prompt: string,
): Promise<ConversationTurnPayload> {
  const rawText = await fetchGeminiGenerate({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.45,
      responseMimeType: 'application/json',
      responseJsonSchema: conversationTurnResponseJsonSchema,
      maxOutputTokens: 1024,
    },
  });
  const jsonText = extractModelJsonText(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${jsonText.slice(0, 200)}`);
  }

  const result = conversationTurnPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid conversation JSON: ${JSON.stringify(result.error.format())}`,
    );
  }

  return result.data;
}
