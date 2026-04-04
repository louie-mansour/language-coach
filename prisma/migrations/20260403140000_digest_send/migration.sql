-- CreateTable
CREATE TABLE "DigestSend" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "strengths" TEXT[],
    "improvements" TEXT[],

    CONSTRAINT "DigestSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigestSend_studentId_idx" ON "DigestSend"("studentId");

-- CreateIndex
CREATE INDEX "DigestSend_sentAt_idx" ON "DigestSend"("sentAt");

-- AddForeignKey
ALTER TABLE "DigestSend" ADD CONSTRAINT "DigestSend_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
