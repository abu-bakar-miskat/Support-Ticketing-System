const AVATAR_COLORS = ["#0a76b9", "#7c3aed", "#16a34a", "#0891b2", "#d97706", "#db2777", "#f59e0b"]

export function avatarColorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
