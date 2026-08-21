import { DashboardShellLayout } from "@/components/dashboard/dashboard-shell-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardShellLayout>{children}</DashboardShellLayout>;
}
