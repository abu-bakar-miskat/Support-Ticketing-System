"use client";

/** Pass-through wrapper — no enter animation so navigation feels instant. */
export function PageEnter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
