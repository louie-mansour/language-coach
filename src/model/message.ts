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
  message: string;
  phoneNumber: string;
};

export type IncomingMessage = SmsMessage;

export type OutgoingMessage = SmsMessage;