import { randomUUID } from 'crypto';
import type { Message } from '../generated/prisma';
export type { Message } from '../generated/prisma';


export function messageFactory(message: Omit<Message, 'id' | 'createdAt'>): Message {
    return {
        id: randomUUID(),
        ...message,
        createdAt: new Date(),
    }
}

export type SmsMessage = {
  channel: 'sms';
  message: string;
  phoneNumber: string;
};

export type TelegramMessage = {
  channel: 'telegram';
  message: string;
  telegramChatId: string;
};

export type IncomingMessage = SmsMessage | TelegramMessage;

export type OutgoingMessage = IncomingMessage;