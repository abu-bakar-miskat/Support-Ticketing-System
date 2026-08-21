import { WifiOff } from "lucide-react";
import { OfflineRetry } from "@/components/pwa/offline-retry";

export const metadata = {
  title: "Offline — Support Ticketing System",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        Check your connection and try again. Cached pages may still be available when you reconnect.
      </p>
      <OfflineRetry />
    </main>
  );
}
