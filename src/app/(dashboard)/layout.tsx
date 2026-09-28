import { DashboardShellLayout } from "@/components/dashboard/dashboard-shell-layout";

// Every dashboard route reads auth cookies via getProfile(), so none of them can
// be statically prerendered. Declaring the segment dynamic stops `next build`
// from attempting a static render (which made cookies() throw DYNAMIC_SERVER_USAGE
// and spammed the build log with "[dashboard-layout] getProfile failed").
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardShellLayout>{children}</DashboardShellLayout>;
}
