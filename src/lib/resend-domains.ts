import "server-only";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** One DNS record the domain owner must add at their DNS provider to pass
 * verification. Flattened from Resend's per-kind record shapes (SPF/DKIM/MX/…)
 * into the subset the UI renders as a copy-paste table. */
export type DomainDnsRecord = {
  record: string; // "SPF" | "DKIM" | "Receiving" | "Tracking" | …
  type: string; // "TXT" | "MX" | "CNAME" | "CAA"
  name: string;
  value: string;
  ttl: string;
  priority?: number;
  status: string; // per-record verification status
};

export type ManagedDomain = {
  id: string;
  name: string;
  status: DomainVerificationStatus;
  createdAt: string | null;
  records: DomainDnsRecord[];
};

function toDnsRecords(records: unknown): DomainDnsRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map((r) => ({
    record: String(r?.record ?? ""),
    type: String(r?.type ?? ""),
    name: String(r?.name ?? ""),
    value: String(r?.value ?? ""),
    ttl: String(r?.ttl ?? "Auto"),
    priority: typeof r?.priority === "number" ? r.priority : undefined,
    status: String(r?.status ?? "not_started"),
  }));
}

export type DomainVerificationStatus =
  | "verified"
  | "pending"
  | "failed"
  | "not_started"
  | "partially_verified"
  | "partially_failed"
  | "unknown"
  | "not_configured";

/** Looks up the sending domain for an email address against the Resend account's
 * verified domains. Returns "unknown" if the domain isn't registered in Resend
 * at all, and "not_configured" if no Resend API key is set. */
export async function checkDomainVerification(email: string): Promise<{
  domain: string | null;
  status: DomainVerificationStatus;
}> {
  const domain = email.split("@")[1]?.trim().toLowerCase() || null;
  if (!domain) return { domain: null, status: "unknown" };
  if (!resend) return { domain, status: "not_configured" };

  try {
    const { data } = await resend.domains.list();
    // A domain name can be registered in more than one Resend region (e.g. an
    // old us-east-1 entry that was never verified plus a live eu-west-1 one).
    // list() returns them all, so match every copy and prefer the verified one
    // rather than whichever .find() happened to hit first.
    const matches = (data?.data ?? []).filter((d) => d.name.toLowerCase() === domain);
    if (matches.length === 0) return { domain, status: "unknown" };
    const best = matches.find((d) => d.status === "verified") ?? matches[0];
    return { domain, status: best.status };
  } catch {
    return { domain, status: "unknown" };
  }
}

// ─── Domain management (self-serve verification from the platform UI) ─────────
//
// Verifying a domain in Resend is a three-step handshake: (1) register the
// domain to get its required DNS records, (2) the owner adds those records at
// their DNS provider (external — we can't automate it), (3) ask Resend to
// re-scan DNS. These wrap the write side of resend.domains.* that
// checkDomainVerification's read-only list() didn't cover. Account-wide in
// Resend (one shared API key), so callers must be super-admin gated.

export type DomainOpError = { error: string };

/** Lists every domain registered in the Resend account (without DNS records —
 * call getManagedDomain for the record detail of one). */
export async function listManagedDomains(): Promise<ManagedDomain[] | DomainOpError> {
  if (!resend) return { error: "Resend is not configured (no RESEND_API_KEY)." };
  try {
    const { data, error } = await resend.domains.list();
    if (error) return { error: error.message };
    return (data?.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      createdAt: d.created_at ?? null,
      records: [],
    }));
  } catch {
    return { error: "Failed to reach Resend." };
  }
}

/** Registers a new sending domain and returns the DNS records to publish. */
export async function createManagedDomain(name: string): Promise<ManagedDomain | DomainOpError> {
  if (!resend) return { error: "Resend is not configured (no RESEND_API_KEY)." };
  const clean = name.trim().toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(clean)) {
    return { error: "Enter a valid domain, e.g. mail.example.com" };
  }
  try {
    const { data, error } = await resend.domains.create({ name: clean });
    if (error || !data) return { error: error?.message ?? "Failed to create the domain." };
    return {
      id: data.id,
      name: data.name,
      status: data.status,
      createdAt: data.created_at ?? null,
      records: toDnsRecords(data.records),
    };
  } catch {
    return { error: "Failed to reach Resend." };
  }
}

/** Fetches one domain with its current per-record verification status — used
 * for polling after the owner has added the DNS records. */
export async function getManagedDomain(id: string): Promise<ManagedDomain | DomainOpError> {
  if (!resend) return { error: "Resend is not configured (no RESEND_API_KEY)." };
  try {
    const { data, error } = await resend.domains.get(id);
    if (error || !data) return { error: error?.message ?? "Domain not found." };
    return {
      id: data.id,
      name: data.name,
      status: data.status,
      createdAt: data.created_at ?? null,
      records: toDnsRecords(data.records),
    };
  } catch {
    return { error: "Failed to reach Resend." };
  }
}

/** Asks Resend to re-scan DNS for the domain. Returns nothing meaningful on
 * success — the caller should re-fetch getManagedDomain for the new status. */
export async function verifyManagedDomain(id: string): Promise<{ ok: true } | DomainOpError> {
  if (!resend) return { error: "Resend is not configured (no RESEND_API_KEY)." };
  try {
    const { error } = await resend.domains.verify(id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch {
    return { error: "Failed to reach Resend." };
  }
}

/** Removes a domain from the Resend account. Account-wide — this can break
 * mailbox connections for other departments that send from this domain. */
export async function removeManagedDomain(id: string): Promise<{ ok: true } | DomainOpError> {
  if (!resend) return { error: "Resend is not configured (no RESEND_API_KEY)." };
  try {
    const { error } = await resend.domains.remove(id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch {
    return { error: "Failed to reach Resend." };
  }
}
