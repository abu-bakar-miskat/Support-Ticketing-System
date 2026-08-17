-- Attach internal notes to a specific customer email message.
-- Additive, nullable column + index; safe to apply while live.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
CREATE INDEX IF NOT EXISTS "Comment_messageId_idx" ON "Comment"("messageId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Comment_messageId_fkey'
  ) THEN
    ALTER TABLE "Comment"
      ADD CONSTRAINT "Comment_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
