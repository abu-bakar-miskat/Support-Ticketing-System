-- Resync TeamTicketCounter after manual ticketNumber edits left the
-- counter behind MAX(ticketNumber), causing P2002 on (teamId, ticketNumber).
INSERT INTO "TeamTicketCounter" ("teamId", "lastNumber")
SELECT "teamId", MAX("ticketNumber")
FROM "Ticket"
GROUP BY "teamId"
ON CONFLICT ("teamId") DO UPDATE
  SET "lastNumber" = GREATEST(
    "TeamTicketCounter"."lastNumber",
    EXCLUDED."lastNumber"
  );

-- Harden the BEFORE INSERT trigger so future manual renumbers auto-recover:
-- next number = GREATEST(counter, max existing ticketNumber) + 1
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_number INT;
BEGIN
  INSERT INTO public."TeamTicketCounter" ("teamId", "lastNumber")
  VALUES (
    NEW."teamId",
    COALESCE(
      (SELECT MAX(t."ticketNumber") FROM public."Ticket" t WHERE t."teamId" = NEW."teamId"),
      0
    ) + 1
  )
  ON CONFLICT ("teamId") DO UPDATE
    SET "lastNumber" = GREATEST(
      "TeamTicketCounter"."lastNumber",
      COALESCE(
        (SELECT MAX(t."ticketNumber") FROM public."Ticket" t WHERE t."teamId" = NEW."teamId"),
        0
      )
    ) + 1
  RETURNING "lastNumber" INTO next_number;

  NEW."ticketNumber" := next_number;
  RETURN NEW;
END;
$$;
