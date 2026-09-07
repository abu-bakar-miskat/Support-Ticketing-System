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

const REVEAL_CSS = `
.sd-rise { animation: sd-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes sd-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sd-rise { animation: none; } }
`;

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-sts-green",
  AUTH_ERROR: "bg-red-500",
  UNREACHABLE: "bg-amber-500",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  AUTH_ERROR: "Sign-in expired",
  UNREACHABLE: "Not responding",
};

function AvatarStack({
  people,
  total,
}: {
  people: SubDepartmentMemberInfo[];
  total: number;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 4);
  const extra = Math.max(0, total - shown.length);
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div
          key={p.userId}
          className="rounded-full border-2 border-sts-card"
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i + 1 }}
          title={p.name}
        >
          <AvatarVisual name={p.name} avatarUrl={p.avatarUrl} size={22} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="flex size-[26px] items-center justify-center rounded-full border-2 border-sts-card bg-sts-surface font-sans text-[10px] font-medium text-sts-subtle"
          style={{ marginLeft: -6, zIndex: shown.length + 1 }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

export function SubDepartmentAbout({
  subDepartment,
}: {
  subDepartment: SubDepartmentAboutData;
}) {
  const mailboxHref = `/sub-departments/${encodeURIComponent(subDepartment.name)}/mailbox`;

  const latestKey =
    subDepartment.ticketsKeyed > 0
      ? `${subDepartment.prefix}-${String(subDepartment.ticketsKeyed).padStart(3, "0")}`
      : `${subDepartment.prefix}-000`;

  const subManagerCount = subDepartment.subManagers.length;
  const memberCount = subDepartment.agents.length;
  const peekPeople = [...subDepartment.subManagers, ...subDepartment.agents];

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <style dangerouslySetInnerHTML={{ __html: REVEAL_CSS }} />

      {/* ── Identity hero — STS tokens; sub-dept color only as a small mark ── */}
      <header className="sd-rise relative overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
          <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sts-blue/10 font-mono text-[17px] font-semibold text-sts-blue">
            {initials(subDepartment.name)}
            <span
              className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-sts-card"
              style={{ backgroundColor: subDepartment.color }}
              title="Sub-department color"
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[1.2px] text-sts-subtle">
              {subDepartment.departmentName} · Sub-department
            </p>
            <h1 className="mt-1 truncate font-sans text-[26px] leading-tight font-semibold text-sts-foreground">
              {subDepartment.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex items-center gap-1 font-sans text-[13px] text-sts-muted">
                <Shield className="size-3.5 shrink-0" />
                {subManagerCount} sub-manager{subManagerCount === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1 font-sans text-[13px] text-sts-muted">
                <Users className="size-3.5 shrink-0" />
                {memberCount} member{memberCount === 1 ? "" : "s"}
              </span>
              {peekPeople.length > 0 && (
                <AvatarStack people={peekPeople} total={peekPeople.length} />
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1 rounded-xl border border-sts-card-border bg-sts-surface px-4 py-3 sm:items-end">
            <span className="font-mono text-[22px] font-semibold tracking-tight text-sts-blue">
              {latestKey}
            </span>
            <span className="font-sans text-[11px] text-sts-subtle">
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
        <Stat icon={<Shield className="size-4" />} value={subManagerCount} label="Sub-managers" />
        <Stat icon={<Users className="size-4" />} value={memberCount} label="Members" />
        <Stat icon={<FolderKanban className="size-4" />} value={subDepartment.projectCount} label="Projects" />
        <Stat
          icon={<Gauge className="size-4" />}
          value={subDepartment.workloadThreshold}
          label="Workload cap"
          hint="open tickets / agent"
        />
      </section>

      {/* ── Leadership + Mailbox ── */}
      <div className="sd-rise grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: "120ms" }}>
        <SectionCard
          title="Sub-managers"
          subtitle="Can triage, assign, and configure this sub-department."
          count={subManagerCount}
        >
          {subManagerCount === 0 ? (
            <Empty
              icon={<Shield className="size-4 text-sts-subtle" />}
              text="No sub-managers assigned yet."
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {subDepartment.subManagers.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-2 rounded-lg border border-sts-card-border bg-sts-surface py-1.5 pl-1.5 pr-3"
                  title={m.name}
                >
                  <AvatarVisual name={m.name} avatarUrl={m.avatarUrl} size={24} />
                  <span className="max-w-[9rem] truncate font-sans text-[12.5px] font-medium text-sts-foreground">
                    {m.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-sts-blue-tint px-1.5 py-0.5 font-sans text-[9.5px] font-semibold text-sts-blue">
                    Lead
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Shared mailbox"
          subtitle="Email sent here opens tickets for this sub-department."
          action={
            <Link
              href={mailboxHref}
              className="flex items-center gap-0.5 font-sans text-[11.5px] font-medium text-sts-blue hover:underline"
            >
              Manage
              <ArrowUpRight className="size-3" />
            </Link>
          }
        >
          {subDepartment.mailboxes.length === 0 ? (
            <Empty
              icon={<UserPlus className="size-4 text-sts-subtle" />}
              text="No mailbox connected."
              cta={
                <Link href={mailboxHref} className="font-medium text-sts-blue hover:underline">
                  Connect one
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {subDepartment.mailboxes.map((mb) => (
                <li
                  key={mb.address}
                  className="flex items-center gap-2.5 rounded-lg border border-sts-card-border bg-sts-surface px-3 py-2"
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[mb.status] ?? "bg-sts-subtle"}`} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-sts-foreground">
                    {mb.address}
                  </span>
                  <span className="shrink-0 font-sans text-[11px] text-sts-subtle">
                    {STATUS_LABEL[mb.status] ?? mb.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ── Members roster ── */}
      <section className="sd-rise" style={{ animationDelay: "180ms" }}>
        <SectionCard
          title="Members"
          subtitle={`People who can pick up ${subDepartment.name} tickets.`}
          count={memberCount}
        >
          {memberCount === 0 ? (
            <Empty
              icon={<Users className="size-4 text-sts-subtle" />}
              text="No members yet — invite someone to get started."
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {subDepartment.agents.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-2 rounded-lg border border-sts-card-border bg-sts-surface py-1.5 pl-1.5 pr-3"
                  title={m.doNotAssign ? `${m.name} · not accepting new tickets` : m.name}
                >
                  <AvatarVisual name={m.name} avatarUrl={m.avatarUrl} size={24} />
                  <div className="min-w-0">
                    <p className="max-w-[9rem] truncate font-sans text-[12.5px] font-medium text-sts-foreground">
                      {m.name}
                    </p>
                    <p className="font-sans text-[10.5px] text-sts-subtle">
                      {m.doNotAssign ? "Not accepting tickets" : "Agent"}
                    </p>
                  </div>
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
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-sts-card-border bg-sts-card p-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-sts-blue/10 text-sts-blue">
        {icon}
      </span>
      <div>
        <p className="font-mono text-[22px] leading-none font-semibold text-sts-foreground">
          {value}
        </p>
        <p className="mt-1.5 font-sans text-[11.5px] font-medium text-sts-muted">{label}</p>
        {hint && <p className="font-sans text-[10.5px] text-sts-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  count,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-sts-card-border bg-sts-card">
      <div className="flex items-start justify-between gap-3 border-b border-sts-card-border px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">
            {title}
            {typeof count === "number" && (
              <span className="ml-1.5 font-normal text-sts-subtle">({count})</span>
            )}
          </h2>
          {subtitle && (
            <p className="mt-0.5 font-sans text-[11.5px] text-sts-muted">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
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
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-sts-card-border px-4 py-6 text-center">
      {icon}
      <p className="font-sans text-[12px] text-sts-muted">
        {text} {cta}
      </p>
    </div>
  );
}
