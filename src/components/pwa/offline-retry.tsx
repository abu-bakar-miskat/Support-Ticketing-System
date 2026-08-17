"use client";

import { Button } from "@/components/ui/button";

export function OfflineRetry() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      Try again
    </Button>
  );
}
