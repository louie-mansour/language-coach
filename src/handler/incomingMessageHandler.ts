import { Intent } from '../model/intent';
import { SmsMessage } from '../model/message';
import { findRecentChatRowsForStudent, persistChatTurn } from '../service/chatService';
import { processIncomingSms } from '../service/conversationService';
import {
  createOrGetStudentByPhoneNumber,
  mergeStudentProfileFromExtractions,
} from '../service/studentService';
import { deleteStudentData } from '../useCase/deleteDataUseCase';

export async function handleIncomingMessage(
  incomingMessage: SmsMessage,
): Promise<SmsMessage> {
  const student = await createOrGetStudentByPhoneNumber(incomingMessage.phoneNumber);
  const recentMessages = await findRecentChatRowsForStudent(student.id);
  const { intent, replyToUser, signUpDetails } = await processIncomingSms(
    incomingMessage,
    student,
    recentMessages,
  );

  if (intent === Intent.DeleteData) {
    await deleteStudentData(student.id);
    return {
      phoneNumber: incomingMessage.phoneNumber,
      message: 'Data deleted',
    };
  }

  // Persist the SMS turn before profile merge so a failing update does not skip chat history.
  await persistChatTurn(student.id, incomingMessage.message, replyToUser);

  const hasExtractions =
    Boolean(signUpDetails.motherTongue?.trim()) ||
    Boolean(signUpDetails.languageToLearn?.trim()) ||
    Boolean(signUpDetails.name?.trim());
  if (hasExtractions) {
    await mergeStudentProfileFromExtractions(student.id, signUpDetails);
  }

  return {
    phoneNumber: incomingMessage.phoneNumber,
    message: replyToUser,
  };
}
