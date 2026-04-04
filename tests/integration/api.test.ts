import nock from 'nock';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';
import { disconnectDatabase, resetDatabase } from '../helpers/db';
import { mockGeminiGenerateContent } from '../helpers/gemini-nock';

const API_KEY = process.env.API_KEY ?? '';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('HTTP → handler → Prisma (Gemini mocked with nock)', () => {
  it('POST /internal/daily-digest returns 401 without cron secret', async () => {
    await request(app).post('/internal/daily-digest').send({}).expect(401);
  });

  it('POST /internal/daily-digest returns summary with cron secret (no students with email)', async () => {
    const secret = 'test-cron-secret-for-digest';
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = secret;
    try {
      const res = await request(app)
        .post('/internal/daily-digest')
        .set('Authorization', `Bearer ${secret}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.studentsConsidered).toBe(0);
      expect(res.body.digestUtcDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it('GET /health is public (no API key; platform health probes)', async () => {
    await request(app).get('/health').expect(200).expect({ ok: true });
  });

  it('POST /message returns 401 without API key', async () => {
    await request(app)
      .post('/message')
      .send({ channel: 'sms', phoneNumber: '+15550000000', message: 'hi' })
      .expect(401);
  });

  it('POST /message stores student + messages and returns mocked coach reply', async () => {
    const phoneNumber = '+15550000001';

    mockGeminiGenerateContent({
      intent: 'chat',
      intentConfidence: 0.9,
      replyToUser: 'Mock coach reply',
    });

    const res = await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({
        channel: 'sms',
        phoneNumber,
        message: 'I want to learn French',
      })
      .expect(200);

    expect(res.body).toEqual({
      channel: 'sms',
      phoneNumber,
      message: 'Mock coach reply',
    });

    const student = await prisma.student.findUnique({ where: { phoneNumber } });
    expect(student).not.toBeNull();
    expect(student!.nativeLanguage).toBe('English');
    expect(student!.languageToLearn).toBe('French');

    const rows = await prisma.message.findMany({
      where: { studentId: student!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].from).toBe('student');
    expect(rows[0].message).toBe('I want to learn French');
    expect(rows[1].from).toBe('model');
    expect(rows[1].message).toBe('Mock coach reply');
  });

  it('POST /message two-step onboarding: English first, French after commit', async () => {
    const phoneNumber = '+15550000003';

    mockGeminiGenerateContent({
      intent: 'chat',
      intentConfidence: 0.9,
      replyToUser: 'Hi! What language would you like to learn?',
    });
    mockGeminiGenerateContent({
      intent: 'chat',
      intentConfidence: 0.9,
      replyToUser: 'Great — let us practice French.',
    });

    const first = await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({ channel: 'sms', phoneNumber, message: 'Hi' })
      .expect(200);

    expect(first.body.message).toBe('Hi! What language would you like to learn?');

    let student = await prisma.student.findUnique({ where: { phoneNumber } });
    expect(student).not.toBeNull();
    expect(student!.nativeLanguage).toBe('English');
    expect(student!.languageToLearn).toBeNull();

    const second = await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({ channel: 'sms', phoneNumber, message: 'French please' })
      .expect(200);

    expect(second.body.message).toBe('Great — let us practice French.');

    student = await prisma.student.findUnique({ where: { phoneNumber } });
    expect(student!.nativeLanguage).toBe('English');
    expect(student!.languageToLearn).toBe('French');

    const rows = await prisma.message.findMany({
      where: { studentId: student!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(4);
  });

  it('POST /message stores email when the user sends an address in the text', async () => {
    const phoneNumber = '+15550000010';

    mockGeminiGenerateContent({
      intent: 'chat',
      intentConfidence: 0.9,
      replyToUser: 'Got it.',
    });

    await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({
        channel: 'sms',
        phoneNumber,
        message: 'You can reach me at Learner@Example.com for the digest',
      })
      .expect(200);

    const student = await prisma.student.findUnique({ where: { phoneNumber } });
    expect(student).not.toBeNull();
    expect(student!.email).toBe('learner@example.com');
  });

  it('POST /message with deleteData intent deletes student and messages', async () => {
    const phoneNumber = '+15550000002';

    // Seed a student and prior chat rows that should be removed.
    const seededStudent = await prisma.student.create({
      data: {
        id: 'student-delete-test',
        phoneNumber,
        telegramChatId: null,
        nativeLanguage: 'English',
        languageToLearn: 'French',
      },
    });
    await prisma.message.createMany({
      data: [
        {
          id: 'msg-delete-1',
          studentId: seededStudent.id,
          channel: 'sms',
          from: 'student',
          message: 'old message',
        },
        {
          id: 'msg-delete-2',
          studentId: seededStudent.id,
          channel: 'sms',
          from: 'model',
          message: 'old reply',
        },
      ],
    });

    mockGeminiGenerateContent({
      intent: 'deleteData',
      intentConfidence: 0.99,
      replyToUser: 'I can delete your data.',
    });

    const res = await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({ channel: 'sms', phoneNumber, message: 'please delete all my data' })
      .expect(200);

    expect(res.body).toEqual({
      channel: 'sms',
      phoneNumber,
      message: 'Data deleted',
    });

    const studentAfter = await prisma.student.findUnique({ where: { phoneNumber } });
    expect(studentAfter).toBeNull();
    const messagesAfter = await prisma.message.findMany({
      where: { studentId: seededStudent.id },
    });
    expect(messagesAfter).toHaveLength(0);
  });

  it('POST /telegram/webhook returns 503 when bot token is not configured', async () => {
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      await request(app)
        .post('/telegram/webhook')
        .send({
          update_id: 1,
          message: {
            message_id: 1,
            chat: { id: 99, type: 'private' },
            text: 'hi',
          },
        })
        .expect(503);
    } finally {
      if (prev !== undefined) process.env.TELEGRAM_BOT_TOKEN = prev;
    }
  });

  it('POST /telegram/webhook returns 401 when webhook secret is set and header is wrong', async () => {
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-webhook-secret';
    try {
      await request(app)
        .post('/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', 'wrong')
        .send({ update_id: 1 })
        .expect(401);
    } finally {
      if (prevSecret !== undefined) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
    }
  });

  it('POST /telegram/webhook runs coach flow and sends reply via Telegram API', async () => {
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-token';
    process.env.TELEGRAM_WEBHOOK_SECRET = '';

    try {
      mockGeminiGenerateContent({
        intent: 'chat',
        intentConfidence: 0.9,
        replyToUser: 'Mock coach reply',
      });

      nock('https://api.telegram.org')
        .post('/bottest-telegram-token/sendMessage')
        .reply(200, { ok: true, result: { message_id: 2 } });

      const res = await request(app)
        .post('/telegram/webhook')
        .send({
          update_id: 1,
          message: {
            message_id: 1,
            chat: { id: 424242424, type: 'private' },
            date: 1234567890,
            text: 'I want to learn French',
          },
        })
        .expect(200);

      expect(res.body).toEqual({ ok: true });

      const student = await prisma.student.findUnique({
        where: { telegramChatId: '424242424' },
      });
      expect(student).not.toBeNull();
      expect(student!.nativeLanguage).toBe('English');
      expect(student!.languageToLearn).toBe('French');

      const rows = await prisma.message.findMany({
        where: { studentId: student!.id, channel: 'telegram' },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].message).toBe('I want to learn French');
      expect(rows[1].message).toBe('Mock coach reply');
    } finally {
      if (prevToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = prevToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
      if (prevSecret !== undefined) process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret;
      else delete process.env.TELEGRAM_WEBHOOK_SECRET;
    }
  });
});
