/**
 * Extracts "owner/name" from a github.com URL (PR, commit, compare, etc.).
 * Returns null when the URL is missing or not a github.com path.
 */
export function repoFromGitHubUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null
  const match = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)(?:\/|$)/i)
  return match ? match[1] : null
}
