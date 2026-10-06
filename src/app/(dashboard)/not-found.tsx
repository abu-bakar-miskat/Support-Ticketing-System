import Link from "next/link";
import { Compass } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16">
      <div className="flex flex-col items-center gap-5 text-center max-w-[440px]">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-sts-surface">
          <Compass className="size-6 text-sts-muted" />
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="sts-text-page-title">Page not found</h1>
          <p className="font-sans text-[13px] leading-relaxed text-sts-muted">
            This page doesn&apos;t exist or you may not have access to it. Check
            the URL, or use the sidebar or ⌘K to find what you need.
          </p>
        </div>

        <Link
          href="/"
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-sts-blue px-5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
        >
          Go to home
        </Link>
      </div>
    </div>
  );
}
