-- Align Message with schema.prisma (init migration used "direction"; app expects "from").
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Message' AND column_name = 'direction'
  ) THEN
    ALTER TABLE "Message" RENAME COLUMN "direction" TO "from";
  END IF;
END $$;
