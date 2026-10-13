"use client";

import { Globe } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  EmailDomainsManager,
  type ManagerDomain,
} from "@/components/email/email-domains-manager";

export function PlatformEmailDomains({
  initialDomains,
  loadError,
}: {
  initialDomains: ManagerDomain[];
  loadError: string | null;
}) {
  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Globe}
          title="Email domains"
          description="View the Resend status of domains used by this project. Domain registration, DNS verification, and receiving settings are managed directly in Resend."
        />
        <div className="mt-6">
          <EmailDomainsManager
            apiBase="/api/admin/email-domains"
            initialDomains={initialDomains}
            loadError={loadError}
            allowRemove={false}
            allowAdd={false}
          />
        </div>
      </div>
    </div>
  );
}
