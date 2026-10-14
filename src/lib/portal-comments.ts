const PORTAL_COMMENT_PREFIX = /^\[Portal — ([^\]\r\n]+)\]\r?\n/

/** Every general comment returned by the Portal API is requester-visible. */
export const PORTAL_COMMENT_VISIBILITY = "public" as const

type PortalCommentContext = {
  body: string
  authorId: string
  apiKeyCreatedById?: string | null
  submitterName?: string | null
}

/**
 * Portal comments retain the integration owner as their database author for
 * auditing. The signed body marker identifies the requester-facing identity.
 * Requiring the linked key owner and the intake name prevents ordinary staff
 * comments from being re-labelled by a look-alike prefix.
 */
export function presentPortalComment(context: PortalCommentContext) {
  const match = PORTAL_COMMENT_PREFIX.exec(context.body)
  const markedName = match?.[1]?.trim() ?? null
  const submitterName = context.submitterName?.trim() ?? null
  const isPortalRequester = Boolean(
    match &&
      markedName &&
      submitterName &&
      markedName === submitterName &&
      context.apiKeyCreatedById &&
      context.authorId === context.apiKeyCreatedById,
  )

  return {
    isPortalRequester,
    body: isPortalRequester ? context.body.slice(match![0].length) : context.body,
    authorName: isPortalRequester ? submitterName : null,
    visibility: PORTAL_COMMENT_VISIBILITY,
  }
}
