import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  Code2,
  Cpu,
  Globe,
  GraduationCap,
  Headphones,
  HeartPulse,
  Layers,
  LayoutGrid,
  Megaphone,
  Monitor,
  Music,
  Network,
  Palette,
  Rocket,
  Server,
  Shield,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

/** Fallback palette — one icon per dept when name doesn't match a keyword. */
const DEPT_ICON_PALETTE: LucideIcon[] = [
  Network,
  Code2,
  Globe,
  Cpu,
  Palette,
  Rocket,
  Layers,
  Briefcase,
  GraduationCap,
  Megaphone,
  Headphones,
  HeartPulse,
  BookOpen,
  Music,
  Wrench,
  Shield,
  Users,
  Monitor,
  Zap,
  LayoutGrid,
];

const KEYWORD_ICONS: { pattern: RegExp; icon: LucideIcon }[] = [
  { pattern: /\bhub\b/i, icon: Sparkles },
  { pattern: /web|frontend|front-end|ui\b|ux\b/i, icon: Code2 },
  { pattern: /software|backend|back-end|engineer|platform|devops|server/i, icon: Server },
  { pattern: /general|corporate|head\s?office|hq\b|admin/i, icon: LayoutGrid },
  { pattern: /market|sales|commercial|growth/i, icon: Megaphone },
  { pattern: /support|service|help\s?desk|customer/i, icon: Headphones },
  { pattern: /finance|account|billing/i, icon: Briefcase },
  { pattern: /hr\b|people|talent|recruit/i, icon: Users },
  { pattern: /education|learning|train|academ/i, icon: GraduationCap },
  { pattern: /health|medical|clinical/i, icon: HeartPulse },
  { pattern: /legal|compliance|risk/i, icon: Shield },
  { pattern: /design|creative|brand/i, icon: Palette },
  { pattern: /product|innovation|r&d/i, icon: Rocket },
  { pattern: /ops|operation|facilit/i, icon: Wrench },
  { pattern: /data|analytics|bi\b/i, icon: Layers },
  { pattern: /media|content|comm/i, icon: Monitor },
];

function hashDeptKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) >>> 0;
  }
  return hash % DEPT_ICON_PALETTE.length;
}

/** Resolve a distinct Lucide icon for a department (stable per id/name). */
export function getDepartmentIcon(
  name: string,
  id?: string,
  isHub?: boolean,
): LucideIcon {
  if (isHub) return Sparkles;

  for (const { pattern, icon } of KEYWORD_ICONS) {
    if (pattern.test(name)) return icon;
  }

  return DEPT_ICON_PALETTE[hashDeptKey(id ?? name.toLowerCase())];
}
