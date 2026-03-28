export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Wire this page to Supabase Auth (e.g. magic link). After sign-in, parents can open the{" "}
        <a className="underline" href="/parent/dashboard">
          dashboard
        </a>
        .
      </p>
    </main>
  );
}
