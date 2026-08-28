"use client";

import { useFormStatus } from "react-dom";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  /** Content shown next to the spinner while the form action is pending. */
  pendingLabel?: string;
};

/**
 * Submit button that reflects the enclosing <form>'s pending state via
 * useFormStatus — shows a spinner and disables itself while the server action
 * runs. Must be rendered as a child of the <form> it submits.
 */
export function SubmitButton({
  children,
  className,
  pendingLabel,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(className, "disabled:cursor-not-allowed disabled:opacity-70")}
    >
      {pending ? (
        <>
          <LoadingSpinner className="size-4" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
