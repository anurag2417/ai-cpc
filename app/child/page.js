export default function ChildPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <h1 className="text-xl font-semibold">Child app</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Mount the chat UI here; call <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/api/chat</code> with{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">childId</code> and{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">mode</code>.
      </p>
    </main>
  );
}
