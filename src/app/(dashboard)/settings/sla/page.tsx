import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import {
  SettingsSlaPage,
  type SlaPriority,
  type SlaRow,
} from "@/components/settings/settings-sla-page";
import type { TicketPriority } from "@/generated/prisma/enums";

export const metadata = { title: "SLA policies — Ticketing System" };

const PRIORITY_UI: Record<
  TicketPriority,
  { order: number; priority: SlaPriority; label: string }
> = {
  Urgent: { order: 0, priority: "urgent", label: "Urgent" },
  Critical: { order: 1, priority: "urgent", label: "Critical" },
  High: { order: 2, priority: "high", label: "High" },
  Medium: { order: 3, priority: "normal", label: "Normal" },
  Low: { order: 4, priority: "low", label: "Low" },
};

function humanizeMins(mins: number): string {
  const unit = (value: number, singular: string) => {
    const rounded = Math.round(value * 10) / 10;
    const display = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1);
    return `${display} ${singular}${rounded === 1 ? "" : "s"}`;
  };
  if (mins < 60) return unit(mins, "minute");
  if (mins < 1440) return unit(mins / 60, "hour");
  return unit(mins / 1440, "day");
}

export default async function SettingsSlaRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins can manage SLA policies
  if (profile.role !== "admin") redirect("/settings");

  const rules = await prisma.slaRule.findMany();
  rules.sort((a, b) => PRIORITY_UI[a.priority].order - PRIORITY_UI[b.priority].order);

  const rows: SlaRow[] = rules.map((rule) => ({
    priority: PRIORITY_UI[rule.priority].priority,
    label: PRIORITY_UI[rule.priority].label,
    firstResponse: humanizeMins(rule.firstResponseMins),
    resolution: humanizeMins(rule.resolutionMins),
  }));

  return <SettingsSlaPage rows={rows} />;
}
