"use client";

import { ReceivedMailPanel } from "@/components/mailbox/received-mail-panel";

export function SubDepartmentReceivedMail({
  subDepartmentId,
  canManage,
}: {
  subDepartmentId: string;
  canManage: boolean;
}) {
  return (
    <ReceivedMailPanel
      endpoint={`/api/admin/sub-departments/${subDepartmentId}/mailbox-mail`}
      canManage={canManage}
    />
  );
}
