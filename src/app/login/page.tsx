import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PenLogo } from "@/components/auth/pen-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";

async function getOrigin() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

async function signInWithMicrosoft(formData: FormData) {
  "use server";
  const origin = await getOrigin();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const cookieStore = await cookies();
  if (next !== "/") {
    cookieStore.set("pen_auth_next", next, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 10,
      sameSite: "lax",
    });
  } else {
    cookieStore.set("pen_auth_next", "", { path: "/", maxAge: 0 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "email profile",
      redirectTo:
        next === "/"
          ? `${origin}/auth/callback`
          : `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.url) redirect(data.url);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam);

  // Redirect already-authenticated users to the dashboard (or invite next)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <main className="pen-ambient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden font-sans">
      <ThemeToggle className="absolute right-6 top-6 z-20" />

      <div
        className={cn(
          "relative z-10 flex w-full max-w-100 flex-col items-center",
          "pen-glass-panel pen-modal-enter rounded-2xl border px-10 pb-10 pt-12 ring-1 ring-white/40 dark:ring-white/10",
        )}
      >
        <PenLogo />

        <div className="h-8" />

        <h1 className="pen-text-admin-title leading-normal">
          Welcome to PEN Platform
        </h1>

        <div className="h-2" />

        <p className="text-center text-[13.5px] leading-normal text-pen-muted">
          Sign in with your PEN work account
        </p>

        <div className="h-8" />

        {error && (
          <div
            role="alert"
            className="mb-4 w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-[13px] text-destructive"
          >
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={signInWithMicrosoft} className="w-full">
          {next !== "/" && <input type="hidden" name="next" value={next} />}
          <button
            type="submit"
            className={cn(
              "flex h-12 w-full items-center justify-center gap-3 rounded-lg",
              "bg-pen-button text-[14px] font-medium text-pen-button-fg",
              "pen-pressable transition-colors hover:bg-pen-button/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-accent/60",
            )}
          >
            <MicrosoftLogo />
            Sign in with Microsoft
          </button>
        </form>

        <div className="h-6" />

        <div className="flex items-center justify-center gap-1.5">
          <span
            className="size-1.25 shrink-0 rounded-full bg-pen-accent"
            aria-hidden
          />
          <p className="text-[11.5px] text-pen-muted">
            Restricted to PEN organization
          </p>
        </div>
      </div>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="0" y="0" width="7" height="7" fill="#f25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7fba00" />
      <rect x="0" y="9" width="7" height="7" fill="#00a4ef" />
      <rect x="9" y="9" width="7" height="7" fill="#ffb900" />
    </svg>
  );
}
