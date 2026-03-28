import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parent dashboard",
  description: "Quiet hours, topic modes, and sentiment alerts",
};

export default function ParentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {children}
    </div>
  );
}
