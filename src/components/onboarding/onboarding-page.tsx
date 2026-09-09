"use client"

import { MailQuestion, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { BrandIcon } from "@/components/auth/sts-logo"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { UserAvatar } from "@/components/ui/user-avatar"

function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }
  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="sts-pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground"
    >
      <LogOut className="size-3.5" />
      Sign out
    </button>
  )
}

type Props = {
  userName: string
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

export function OnboardingPage({ userName }: Props) {
  return (
    <main className="sts-ambient-bg relative flex min-h-svh flex-col font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-sts-card-border/60 bg-sts-bg/70 px-5 backdrop-blur sm:px-8">
        <BrandIcon className="h-12" />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center gap-7 px-5 pb-20 pt-10 sm:px-6">
        {/* Signed-in identity */}
        <div className="sts-page-enter flex items-center gap-2.5">
          <UserAvatar name={userName} size={28} />
          <span className="font-sans text-[12px] text-sts-muted">
            Signed in as <span className="font-medium text-sts-foreground">{userName}</span>
          </span>
        </div>

        {/* Invite-only message */}
        <div className="sts-glass-panel sts-modal-enter flex flex-col items-center gap-4 rounded-2xl border px-8 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-sts-accent/10">
            <MailQuestion className="size-8 text-sts-accent" strokeWidth={1.75} />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="sts-text-section-label">Welcome aboard</span>
            <h1 className="font-display text-[26px] leading-tight tracking-[-0.01em] text-sts-foreground text-balance sm:text-[30px]">
              Hey {firstName(userName)} — you&apos;re almost set.
            </h1>
            <p className="max-w-[42ch] font-sans text-[13.5px] leading-relaxed text-sts-muted">
              You don&apos;t have access to a workspace yet. Please contact your
              tenant or department manager and ask them to send you an invite
              link. Once you accept it, you&apos;ll land straight in your
              workspace.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          <span className="size-1 shrink-0 rounded-full bg-sts-accent" aria-hidden />
          <p className="text-center font-sans text-[11.5px] text-sts-subtle">
            Already have an invite link? Open it to join your team.
          </p>
        </div>
      </div>
    </main>
  )
}
