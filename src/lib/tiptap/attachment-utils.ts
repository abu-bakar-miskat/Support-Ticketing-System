/** Extract temporary attachment IDs embedded in rich-text description HTML. */
export function extractAttachmentIdsFromHtml(html: string): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  const re = /data-attachment-id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}
