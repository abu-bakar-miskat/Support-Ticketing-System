/**
 * Standalone chrome for the candidate-facing screening page, in the VCAD/PEN
 * dark system: base #030A2E, cards #051251, borders #384584, text #EBECF3,
 * accent #FF379E. Inter throughout; 12px card radius, 8px controls.
 */

export function ScreeningShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 overflow-y-auto bg-[#030A2E] text-[#EBECF3]"
      style={{ fontFamily: "'Inter Variable', Inter, system-ui, sans-serif" }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center gap-3">
          <span className="text-sm font-semibold tracking-[0.2em] text-[#EBECF3]/60 uppercase">
            PEN Group
          </span>
          <span className="h-1 w-1 rounded-full bg-[#FF379E]" />
          <span className="text-sm text-[#EBECF3]/60">Video introduction</span>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

export function ScreeningNotice({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-[#384584] bg-[#051251] p-8">
      <h1 className="mb-3 text-xl font-semibold text-[#EBECF3]">{heading}</h1>
      <p className="text-[15px] leading-relaxed text-[#EBECF3]/70">{body}</p>
    </div>
  )
}
