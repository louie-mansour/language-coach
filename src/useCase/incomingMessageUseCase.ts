import { Intent } from '../model/intent';
import type { IncomingMessage, OutgoingMessage } from '../model/message';
import { findRecentChatRowsForStudent, persistChatTurn, type ChatChannel } from '../service/chatService';
import { processIncomingSms } from '../service/conversationService';
import {
  createOrGetStudentByPhoneNumber,
  createOrGetStudentByTelegramChatId,
  mergeStudentProfileFromExtractions,
} from '../service/studentService';
import { deleteStudentData } from './deleteDataUseCase';

function channelForStudent(incoming: IncomingMessage): ChatChannel {
  return incoming.channel === 'telegram' ? 'telegram' : 'sms';
}

export async function handleIncomingMessage(incomingMessage: IncomingMessage): Promise<OutgoingMessage> {
  const channel = channelForStudent(incomingMessage);
  const student =
    incomingMessage.channel === 'telegram'
      ? await createOrGetStudentByTelegramChatId(incomingMessage.telegramChatId)
      : await createOrGetStudentByPhoneNumber(incomingMessage.phoneNumber);

  const recentMessages = await findRecentChatRowsForStudent(student.id, 12, channel);
  const { intent, replyToUser, signUpDetails } = await processIncomingSms(
    incomingMessage,
    student,
    recentMessages,
    channel,
  );

  if (intent === Intent.DeleteData) {
    await deleteStudentData(student.id);
    return incomingMessage.channel === 'telegram'
      ? {
          channel: 'telegram',
          telegramChatId: incomingMessage.telegramChatId,
          message: 'Data deleted',
        }
      : {
          channel: 'sms',
          phoneNumber: incomingMessage.phoneNumber,
          message: 'Data deleted',
        };
  }

  await persistChatTurn(student.id, incomingMessage.message, replyToUser, channel);

  const hasExtractions =
    Boolean(signUpDetails.nativeLanguage?.trim()) ||
    Boolean(signUpDetails.languageToLearn?.trim()) ||
    Boolean(signUpDetails.name?.trim());
  if (hasExtractions) {
    await mergeStudentProfileFromExtractions(student.id, signUpDetails);
  }

  return incomingMessage.channel === 'telegram'
    ? {
        channel: 'telegram',
        telegramChatId: incomingMessage.telegramChatId,
        message: replyToUser,
      }
    : {
        channel: 'sms',
        phoneNumber: incomingMessage.phoneNumber,
        message: replyToUser,
      };
}
