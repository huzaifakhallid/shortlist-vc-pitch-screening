import { TopNav } from "@/components/top-nav";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TopNav />
      <main>{children}</main>
    </>
  );
}
