import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { prisma } from '../../src/prisma';
import { disconnectDatabase, resetDatabase } from '../helpers/db';
import { mockGeminiGenerateContent } from '../helpers/gemini-nock';

const API_KEY = process.env.API_KEY ?? '';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('HTTP → handler → Prisma (Gemini mocked with nock)', () => {
  it('GET /health is public (no API key; platform health probes)', async () => {
    await request(app).get('/health').expect(200).expect({ ok: true });
  });

  it('POST /message returns 401 without API key', async () => {
    await request(app)
      .post('/message')
      .send({ phoneNumber: '+15550000000', message: 'hi' })
      .expect(401);
  });

  it('POST /message stores student + messages and returns mocked coach reply', async () => {
    const phoneNumber = '+15550000001';

    mockGeminiGenerateContent({
      intent: 'chat',
      intentConfidence: 0.9,
      replyToUser: 'Mock coach reply',
      motherTongue: null,
      motherTongueConfidence: 0,
      languageToLearn: null,
      languageToLearnConfidence: 0,
    });

    const res = await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({ phoneNumber, message: 'Hello from test' })
      .expect(200);

    expect(res.body).toEqual({
      phoneNumber,
      message: 'Mock coach reply',
    });

    const student = await prisma.student.findUnique({ where: { phoneNumber } });
    expect(student).not.toBeNull();

    const rows = await prisma.message.findMany({
      where: { studentId: student!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].from).toBe('student');
    expect(rows[0].message).toBe('Hello from test');
    expect(rows[1].from).toBe('model');
    expect(rows[1].message).toBe('Mock coach reply');
  });

  it('POST /message with deleteData intent deletes student and messages', async () => {
    const phoneNumber = '+15550000002';

    // Seed a student and prior chat rows that should be removed.
    const seededStudent = await prisma.student.create({
      data: {
        id: 'student-delete-test',
        phoneNumber,
        motherTongue: 'English',
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
      motherTongue: null,
      motherTongueConfidence: 0,
      languageToLearn: null,
      languageToLearnConfidence: 0,
    });

    const res = await request(app)
      .post('/message')
      .set('x-api-key', API_KEY)
      .send({ phoneNumber, message: 'please delete all my data' })
      .expect(200);

    expect(res.body).toEqual({
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
});
