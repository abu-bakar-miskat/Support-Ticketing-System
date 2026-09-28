type MailboxConnectionAddress = { id: string; address: string }

function normalizeRecipientAddress(recipient: string): string {
  const angle = recipient.match(/<([^>]+)>/)
  return (angle ? angle[1] : recipient).trim().toLowerCase()
}

function stringArray(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is string => typeof entry === "string",
  )
}

/**
 * Identifies the connected mailbox through which an inbound message arrived.
 *
 * New records carry `mailboxConnectionId`, written by the inbound router after
 * it resolves the exact connection. The recipient fallback keeps mail received
 * before that field was introduced visible in the mailbox screen.
 */
export function mailboxConnectionIdsForMessage(
  rawPayload: unknown,
  connections: MailboxConnectionAddress[],
): string[] {
  if (!rawPayload || typeof rawPayload !== "object") return []

  const payload = rawPayload as {
    mailboxConnectionId?: unknown
    envelopeTo?: unknown
    to?: unknown
  }

  if ("mailboxConnectionId" in payload) {
    return typeof payload.mailboxConnectionId === "string" &&
      connections.some((connection) => connection.id === payload.mailboxConnectionId)
      ? [payload.mailboxConnectionId]
      : []
  }

  const recipients = new Set(
    [...stringArray(payload.envelopeTo), ...stringArray(payload.to)]
      .map(normalizeRecipientAddress)
      .filter(Boolean),
  )

  return connections
    .filter((connection) => recipients.has(connection.address.trim().toLowerCase()))
    .map((connection) => connection.id)
}
