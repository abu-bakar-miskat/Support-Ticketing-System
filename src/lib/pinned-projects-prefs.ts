/** Per-user pinned project ids stored on `profile.preferences.pinnedProjectIds`. */
export function parsePinnedProjectIds(preferences: unknown): string[] {
  if (
    !preferences ||
    typeof preferences !== "object" ||
    Array.isArray(preferences)
  ) {
    return [];
  }
  const p = preferences as Record<string, unknown>;
  if (!Array.isArray(p.pinnedProjectIds)) return [];
  return p.pinnedProjectIds.filter((id): id is string => typeof id === "string");
}
