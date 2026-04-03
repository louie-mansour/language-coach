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
  })
  .passthrough();

export type ConversationTurnPayload = z.infer<typeof conversationTurnPayloadSchema>;

/** End-of-day email digest (derived from same-day transcript; not shown in SMS). */
export const dailyDigestPayloadSchema = z
  .object({
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    shouldSend: z.boolean(),
  })
  .transform((d) => ({
    strengths: d.strengths.slice(0, 3),
    improvements: d.improvements.slice(0, 3),
    shouldSend: d.shouldSend,
  }));

export type DailyDigestPayload = z.infer<typeof dailyDigestPayloadSchema>;

export const dailyDigestResponseJsonSchema = {
  type: 'object',
  properties: {
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Up to 3 specific, positive observations about what felt natural or strong in the target language.',
    },
    improvements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 3 gentle, actionable suggestions—supportive tone, not harsh.',
    },
    shouldSend: {
      type: 'boolean',
      description:
        'False if there was no meaningful practice (only onboarding, empty chat, or no target-language use).',
    },
  },
  required: ['strengths', 'improvements', 'shouldSend'],
} as const;

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
        'Short message, natural and varied. Follow the system prompt: during onboarding ask what language they want to learn (only French is supported); after they commit, coach mainly in French with brief English when helpful.',
    },
  },
  required: ['intent', 'intentConfidence', 'replyToUser'],
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

async function geminiJsonCompletion(
  userPrompt: string,
  responseJsonSchema: object,
  opts: { maxOutputTokens: number; temperature: number },
): Promise<string> {
  return fetchGeminiGenerate({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: opts.temperature,
      responseMimeType: 'application/json',
      responseJsonSchema,
      maxOutputTokens: opts.maxOutputTokens,
    },
  });
}

/**
 * One call: intent + reply (JSON mode). Languages are fixed in app code (English → French).
 */
export async function completeConversationTurnPrompt(
  prompt: string,
): Promise<ConversationTurnPayload> {
  const rawText = await geminiJsonCompletion(prompt, conversationTurnResponseJsonSchema, {
    maxOutputTokens: 1024,
    temperature: 0.45,
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

/**
 * Summarizes strengths and improvements from a single day's transcript (UTC day).
 */
export async function completeDailyDigestPrompt(prompt: string): Promise<DailyDigestPayload> {
  const rawText = await geminiJsonCompletion(prompt, dailyDigestResponseJsonSchema, {
    maxOutputTokens: 768,
    temperature: 0.35,
  });
  const jsonText = extractModelJsonText(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini returned non-JSON (digest): ${jsonText.slice(0, 200)}`);
  }

  const result = dailyDigestPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid digest JSON: ${JSON.stringify(result.error.format())}`,
    );
  }

  return result.data;
}
