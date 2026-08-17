-- Correct reply tokens that were backfilled as 64 hex chars (two concatenated
-- UUIDs) in 20260707120000_add_customer_messages. generateReplyToken() emits
-- 48 hex chars (24 random bytes) and extractReplyToken() requires exactly
-- /^[a-f0-9]{48}$/, so 64-char tokens could never match an inbound reply.
-- Idempotent: re-running matches nothing once every token is 48 chars.
UPDATE "Intake"
SET "replyToken" = substr(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  1,
  48
)
WHERE "replyToken" IS NOT NULL AND length("replyToken") <> 48;
