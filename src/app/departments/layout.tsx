import { DepartmentsShellLayout } from "@/components/departments/departments-shell-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DepartmentsShellLayout>{children}</DepartmentsShellLayout>;
}
