import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import {
  listManagedDomains,
  selectBestManagedDomain,
  type DomainOpError,
  type ManagedDomain,
} from "@/lib/resend-domains";

/**
 * Returns only Resend domains that belong to this application. The Resend API
 * key is shared, so its domain list can also contain domains for other
 * projects; a platform page must never present those as this project's setup.
 *
 * A domain is considered in use here when it has been registered by a tenant
 * or when a configured mailbox uses an address on it. Keeping both sources
 * means pending domain verification remains visible while also covering older
 * mailbox connections that predate the EmailDomain record.
 */
export async function listProjectManagedDomains(): Promise<ManagedDomain[] | DomainOpError> {
  const [managedDomains, registeredDomains, mailboxConnections] = await Promise.all([
    listManagedDomains(),
    runAsSystem(() => prisma.emailDomain.findMany({ select: { name: true } })),
    runAsSystem(() => prisma.mailboxConnection.findMany({ select: { address: true } })),
  ]);

  if ("error" in managedDomains) return managedDomains;

  const projectDomainNames = new Set(registeredDomains.map(({ name }) => name.trim().toLowerCase()));
  for (const { address } of mailboxConnections) {
    const domain = address.split("@")[1]?.trim().toLowerCase();
    if (domain) projectDomainNames.add(domain);
  }

  const projectDomains = managedDomains.filter((domain) =>
    projectDomainNames.has(domain.name.trim().toLowerCase()),
  );

  // Resend can hold the same domain name in more than one region (e.g. a stale
  // us-east-1 copy left over before the eu-west-1 migration, still "failed" with
  // receiving off). Returning every copy let the UI collapse them by name
  // last-wins, arbitrarily surfacing the dead copy — showing it as unverified
  // and pointing the receiving toggle at the wrong registration. Collapse each
  // name to its best (verified / receiving-enabled) copy, the same way send-side
  // verification checks already do.
  const bestByName = new Map<string, ManagedDomain>();
  for (const domain of projectDomains) {
    const key = domain.name.trim().toLowerCase();
    if (bestByName.has(key)) continue;
    const best = selectBestManagedDomain(projectDomains, domain.name);
    if (best) bestByName.set(key, best);
  }
  return [...bestByName.values()];
}
