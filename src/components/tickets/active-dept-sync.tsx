"use client";

import { useEffect, useRef } from "react";

/**
 * When a ticket is opened via a shared link and it lives in a different
 * department than the viewer's currently-active workspace, switch the active
 * department to the ticket's origin (the server only renders this when the
 * viewer is allowed to work in that department). A full reload lets every
 * server component re-read the new cookie — matching the sidebar's own
 * department switch behaviour.
 */
export function ActiveDeptSync({ deptId }: { deptId: string }) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    fetch("/api/active-dept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId }),
    })
      .then((res) => {
        if (res.ok) window.location.reload();
      })
      .catch(() => {});
  }, [deptId]);

  return null;
}
