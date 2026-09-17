import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { listManagedDomains, type DomainOpError, type ManagedDomain } from "@/lib/resend-domains";

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

  return managedDomains.filter((domain) => projectDomainNames.has(domain.name.trim().toLowerCase()));
}
