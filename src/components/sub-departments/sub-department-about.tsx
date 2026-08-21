import Link from "next/link";
import {
  ArrowUpRight,
  FolderKanban,
  Gauge,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import { AvatarVisual } from "@/components/ui/user-avatar";
import type {
  SubDepartmentAboutData,
  SubDepartmentMemberInfo,
} from "@/lib/sub-department-access";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** color-mix keeps the whole page tinted by the team's own colour. */
const tint = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const REVEAL_CSS = `
.sd-rise { animation: sd-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes sd-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sd-rise { animation: none; } }
`;

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-pen-green",
  AUTH_ERROR: "bg-red-500",
  UNREACHABLE: "bg-amber-500",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  AUTH_ERROR: "Sign-in expired",
  UNREACHABLE: "Not responding",
};

export function SubDepartmentAbout({
  subDepartment,
}: {
  subDepartment: SubDepartmentAboutData;
}) {
  const accent = subDepartment.color;
  const mailboxHref = `/sub-departments/${encodeURIComponent(subDepartment.name)}/mailbox`;

  const latestKey =
    subDepartment.ticketsKeyed > 0
      ? `${subDepartment.prefix}-${String(subDepartment.ticketsKeyed).padStart(3, "0")}`
      : `${subDepartment.prefix}-000`;

  const roster = [...subDepartment.subManagers, ...subDepartment.agents];

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <style dangerouslySetInnerHTML={{ __html: REVEAL_CSS }} />

      {/* ── Identity hero: the team's colour + its ticket-key plate ── */}
      <header
        className="sd-rise relative overflow-hidden rounded-2xl border bg-pen-card"
        style={{
          borderColor: tint(accent, 32),
          backgroundImage: `radial-gradient(130% 150% at 0% 0%, ${tint(accent, 16)}, transparent 55%)`,
        }}
      >
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl font-mono text-[17px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: accent }}
          >
            {initials(subDepartment.name)}
          </span>

          <div className="min-w-0 flex-1">
            <p
              className="font-sans text-[11px] font-semibold tracking-[1.2px] uppercase"
              style={{ color: `color-mix(in srgb, ${accent} 65%, var(--pen-muted, #6b7280))` }}
            >
              {subDepartment.departmentName} · Sub department
            </p>
            <h1 className="mt-1 truncate font-sans text-[26px] leading-tight font-semibold text-pen-foreground">
              {subDepartment.name}
            </h1>
            <p className="mt-1 font-sans text-[13px] text-pen-muted">
              {subDepartment.memberCount} member{subDepartment.memberCount === 1 ? "" : "s"}
              {subDepartment.subManagers.length > 0 &&
                ` · ${subDepartment.subManagers.length} sub-manager${subDepartment.subManagers.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {/* Signature: this team's tickets are keyed by its prefix. */}
          <div
            className="flex shrink-0 flex-col items-start gap-1 rounded-xl border px-4 py-3 sm:items-end"
            style={{ borderColor: tint(accent, 28), backgroundColor: tint(accent, 7) }}
          >
            <span
              className="font-mono text-[22px] font-semibold tracking-tight"
              style={{ color: accent }}
            >
              {latestKey}
            </span>
            <span className="font-sans text-[11px] text-pen-subtle">
              {subDepartment.ticketsKeyed > 0 ? "Latest ticket key" : "First ticket key"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Stat band ── */}
      <section
        className="sd-rise grid grid-cols-2 gap-3 lg:grid-cols-4"
        style={{ animationDelay: "60ms" }}
      >
        <Stat icon={<Users className="size-4" />} value={subDepartment.memberCount} label="Members" accent={accent} />
        <Stat icon={<Shield className="size-4" />} value={subDepartment.subManagers.length} label="Sub-managers" accent={accent} />
        <Stat icon={<FolderKanban className="size-4" />} value={subDepartment.projectCount} label="Projects" accent={accent} />
        <Stat
          icon={<Gauge className="size-4" />}
          value={subDepartment.workloadThreshold}
          label="Workload cap"
          hint="open tickets / agent"
          accent={accent}
        />
      </section>

      {/* ── Leadership + Mailbox ── */}
      <div className="sd-rise grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: "120ms" }}>
        <SectionCard
          title="Leadership"
          subtitle="Sub-managers can triage, assign, and configure this team."
        >
          {subDepartment.subManagers.length === 0 ? (
            <Empty
              icon={<Shield className="size-4 text-pen-subtle" />}
              text="No sub-managers assigned yet."
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {subDepartment.subManagers.map((m) => (
                <MemberRow key={m.userId} member={m} accent={accent} showRole />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Shared mailbox"
          subtitle="Email sent here opens tickets for this team."
          action={
            <Link
              href={mailboxHref}
              className="flex items-center gap-0.5 font-sans text-[11.5px] font-medium text-pen-blue hover:underline"
            >
              Manage
              <ArrowUpRight className="size-3" />
            </Link>
          }
        >
          {subDepartment.mailboxes.length === 0 ? (
            <Empty
              icon={<UserPlus className="size-4 text-pen-subtle" />}
              text="No mailbox connected."
              cta={
                <Link href={mailboxHref} className="font-medium text-pen-blue hover:underline">
                  Connect one
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {subDepartment.mailboxes.map((mb) => (
                <li
                  key={mb.address}
                  className="flex items-center gap-2.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2"
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[mb.status] ?? "bg-pen-subtle"}`} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                    {mb.address}
                  </span>
                  <span className="shrink-0 font-sans text-[11px] text-pen-subtle">
                    {STATUS_LABEL[mb.status] ?? mb.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ── Roster ── */}
      <section className="sd-rise" style={{ animationDelay: "180ms" }}>
        <SectionCard
          title="Team roster"
          subtitle={`Everyone who can pick up ${subDepartment.name} tickets.`}
        >
          {roster.length === 0 ? (
            <Empty
              icon={<Users className="size-4 text-pen-subtle" />}
              text="No members yet — invite someone to get started."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {roster.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-3 rounded-xl border border-pen-card-border bg-pen-surface px-3 py-2.5"
                >
                  <AvatarVisual name={m.name} avatarUrl={m.avatarUrl} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[13px] font-medium text-pen-foreground">
                      {m.name}
                    </p>
                    <p className="truncate font-sans text-[11px] text-pen-subtle">
                      {m.role === "sub_manager"
                        ? "Sub-manager"
                        : m.doNotAssign
                          ? "Not accepting new tickets"
                          : "Agent"}
                    </p>
                  </div>
                  {m.role === "sub_manager" && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold"
                      style={{ backgroundColor: tint(accent, 12), color: accent }}
                    >
                      Lead
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint?: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-pen-card-border bg-pen-card p-4">
      <span
        className="flex size-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint(accent, 12), color: accent }}
      >
        {icon}
      </span>
      <div>
        <p className="font-mono text-[22px] leading-none font-semibold text-pen-foreground">
          {value}
        </p>
        <p className="mt-1.5 font-sans text-[11.5px] font-medium text-pen-muted">{label}</p>
        {hint && <p className="font-sans text-[10.5px] text-pen-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-pen-card-border bg-pen-card">
      <div className="flex items-start justify-between gap-3 border-b border-pen-card-border px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MemberRow({
  member,
  accent,
  showRole,
}: {
  member: SubDepartmentMemberInfo;
  accent: string;
  showRole?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <AvatarVisual name={member.name} avatarUrl={member.avatarUrl} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-[13px] font-medium text-pen-foreground">
          {member.name}
        </p>
        {showRole && (
          <p className="truncate font-sans text-[11px]" style={{ color: accent }}>
            Sub-manager
          </p>
        )}
      </div>
    </li>
  );
}

function Empty({
  icon,
  text,
  cta,
}: {
  icon: React.ReactNode;
  text: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-pen-card-border px-4 py-6 text-center">
      {icon}
      <p className="font-sans text-[12px] text-pen-muted">
        {text} {cta}
      </p>
    </div>
  );
}
