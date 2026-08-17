import Link from "next/link";
import { FileX } from "lucide-react";

export default function TicketNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16">
      <div className="flex flex-col items-center gap-5 text-center max-w-[440px]">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-pen-surface">
          <FileX className="size-6 text-pen-muted" />
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="pen-text-page-title">Ticket not found</h1>
          <p className="font-sans text-[13px] leading-relaxed text-pen-muted">
            This ticket doesn&apos;t exist or may have been deleted. Check the
            URL or return to the board.
          </p>
        </div>

        <Link
          href="/board"
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-xl bg-pen-blue px-5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
        >
          Go to board
        </Link>
      </div>
    </div>
  );
}
