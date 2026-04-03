-- Telegram-only learners use telegramChatId; SMS learners use phoneNumber.
-- PostgreSQL UNIQUE allows multiple NULLs for nullable columns.
ALTER TABLE "Student" ADD COLUMN "telegramChatId" TEXT;

CREATE UNIQUE INDEX "Student_telegramChatId_key" ON "Student"("telegramChatId");

ALTER TABLE "Student" ALTER COLUMN "phoneNumber" DROP NOT NULL;
