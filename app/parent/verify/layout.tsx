import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parent verification",
  description: "Verifiable parental consent (VPC)",
};

export default function ParentVerifyLayout({
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
