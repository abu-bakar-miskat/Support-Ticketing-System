"use client";

import {
  EmailDomainsManager,
  type ManagerDomain,
  type ManagerDepartmentScope,
} from "@/components/email/email-domains-manager";
import {
  DomainRequestsPanel,
  type PendingDomainRequest,
} from "@/components/email/domain-requests-panel";

export function SettingsEmailDomains({
  initialDomains,
  departments,
  domainRequests,
  hasTenant,
}: {
  initialDomains: ManagerDomain[];
  departments: ManagerDepartmentScope[];
  domainRequests: PendingDomainRequest[];
  hasTenant: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-6 px-5 pt-8 pb-12 sm:px-8 lg:px-10">
        <header className="flex max-w-[920px] flex-col gap-[3px]">
          <h1 className="sts-text-admin-title">Email domains</h1>
          <p className="font-sans text-[13px] text-sts-muted">
            Register and verify the domains your workspace sends support email from. Once a domain is verified, you can
            connect mailbox addresses on it.
          </p>
        </header>

        <div className="max-w-[920px]">
          {hasTenant ? (
            <>
              <DomainRequestsPanel requests={domainRequests} />
              <EmailDomainsManager
                apiBase="/api/admin/email-identity/domains"
                initialDomains={initialDomains}
                loadError={null}
                departments={departments}
              />
            </>
          ) : (
            <p className="rounded-xl border border-sts-card-border bg-sts-card px-[22px] py-10 text-center font-sans text-[12.5px] text-sts-muted shadow-sts-card">
              Select a workspace to manage its email domains.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
