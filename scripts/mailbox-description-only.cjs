// Move one existing mailbox ticket's origin metadata out of its conversation.
// Usage: node scripts/mailbox-description-only.cjs <ticket-id> [--apply]
require("dotenv/config");
const { Client } = require("pg");

async function main() {
  const ticketId = process.argv[2];
  if (!ticketId || ticketId.startsWith("--")) throw new Error("A ticket ID is required");
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith("pooler.supabase.com") && url.port === "5432") url.port = "6543";
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    // Match inbound processing's lock order: provider ID before ticket rows.
    const { rows: [candidate] } = await client.query('SELECT "providerMessageId" FROM "TicketMessage" WHERE "ticketId"=$1 ORDER BY "createdAt" LIMIT 1', [ticketId]);
    if (candidate?.providerMessageId) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [candidate.providerMessageId]);
    const { rows: [ticket] } = await client.query('SELECT id, description, "createdAt" FROM "Ticket" WHERE id=$1 FOR UPDATE', [ticketId]);
    if (!ticket) throw new Error("Ticket not found");
    const { rows: [intake] } = await client.query('SELECT id FROM "Intake" WHERE "ticketId"=$1', [ticketId]);
    if (intake) throw new Error("Only shared mailbox tickets can be converted");
    const { rows: [audit] } = await client.query('SELECT id, metadata FROM "ActivityLog" WHERE "ticketId"=$1 AND action=\'TICKET_CREATED\' ORDER BY "createdAt" LIMIT 1 FOR UPDATE', [ticketId]);
    if (audit?.metadata?.source !== "email") throw new Error("Ticket was not created from email");
    if (audit.metadata.providerMessageId) {
      console.log("Ticket already uses description-only email storage");
      await client.query("ROLLBACK");
      return;
    }
    const { rows: [origin] } = await client.query('SELECT * FROM "TicketMessage" WHERE "ticketId"=$1 ORDER BY "createdAt" LIMIT 1 FOR UPDATE', [ticketId]);
    const gap = origin && new Date(origin.createdAt) - new Date(ticket.createdAt);
    if (!origin || origin.direction !== "inbound" || origin.status !== "trusted" || gap < 0 || gap > 60000 || !origin.providerMessageId) {
      throw new Error("No confirmed original mailbox email to convert");
    }
    if (ticket.description !== origin.bodyHtml) throw new Error("Description differs from original email; refusing to discard its body");
    const payload = origin.rawPayload ?? {};
    const rawPayload = Object.fromEntries(["to", "envelopeTo", "mailboxConnectionId", "resendEmailId", "headers"].filter(key => payload[key] != null).map(key => [key, payload[key]]));
    const metadata = { ...audit.metadata, fromEmail: origin.fromEmail, fromName: origin.fromName, providerMessageId: origin.providerMessageId, rawPayload };
    await client.query('UPDATE "ActivityLog" SET metadata=$2::jsonb WHERE id=$1', [audit.id, JSON.stringify(metadata)]);
    await client.query('UPDATE "Attachment" SET "messageId"=NULL WHERE "messageId"=$1', [origin.id]);
    await client.query('UPDATE "Comment" SET "messageId"=NULL WHERE "messageId"=$1', [origin.id]);
    await client.query('DELETE FROM "TicketMessage" WHERE id=$1 AND "ticketId"=$2', [origin.id, ticketId]);
    await client.query('UPDATE "Ticket" SET "updatedAt"=NOW() WHERE id=$1', [ticketId]);
    const apply = process.argv.includes("--apply");
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(JSON.stringify({ ticketId, originalMessageRemoved: origin.id, applied: apply, descriptionPreserved: true, routingMetadataPreserved: true }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
