"use client";

import { useEffect, useState } from "react";

type KbaQuestion = { id: string; label: string };

export default function ParentVerifyPage() {
  const [questions, setQuestions] = useState<KbaQuestion[]>([]);
  const [kbaConfigured, setKbaConfigured] = useState(false);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [kbaLoading, setKbaLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerTone, setBannerTone] = useState<"ok" | "err" | "info">("info");

  useEffect(() => {
    void fetch("/api/parent/verify/kba/questions")
      .then((r) => r.json())
      .then((d: { questions?: KbaQuestion[]; configured?: boolean }) => {
        setQuestions(d.questions ?? []);
        setKbaConfigured(Boolean(d.configured));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "1") {
      setBannerTone("info");
      setBanner("Card verification was canceled.");
      window.history.replaceState({}, "", "/parent/verify");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (!sid) return;

    void (async () => {
      setBannerTone("info");
      setBanner("Confirming payment with Stripe…");
      const res = await fetch(
        `/api/parent/verify/stripe/complete?session_id=${encodeURIComponent(sid)}`,
        { credentials: "same-origin" }
      );
      const data = (await res.json()) as { error?: string; ok?: boolean };
      window.history.replaceState({}, "", "/parent/verify");
      if (res.ok && data.ok) {
        setBannerTone("ok");
        setBanner("Verified. You can add a child profile from the parent dashboard.");
      } else {
        setBannerTone("err");
        setBanner(data.error ?? "Could not confirm Stripe session.");
      }
    })();
  }, []);

  const startStripe = async () => {
    setStripeLoading(true);
    setBanner(null);
    try {
      const res = await fetch("/api/parent/verify/stripe/checkout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        setBannerTone("err");
        setBanner("Sign in first, then try again.");
        return;
      }
      if (res.status === 503) {
        setBannerTone("err");
        setBanner("Stripe is not configured on the server (STRIPE_SECRET_KEY).");
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setBannerTone("err");
      setBanner(data.error ?? "Could not start Checkout.");
    } finally {
      setStripeLoading(false);
    }
  };

  const submitKba = async () => {
    setKbaLoading(true);
    setBanner(null);
    try {
      const res = await fetch("/api/parent/verify/kba", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q1, q2, q3 }),
      });
      const data = (await res.json()) as { error?: string; message?: string; ok?: boolean };
      if (res.ok && data.ok) {
        setBannerTone("ok");
        setBanner("Knowledge-based verification succeeded.");
        return;
      }
      setBannerTone("err");
      setBanner(data.message ?? data.error ?? "Verification failed.");
    } finally {
      setKbaLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Parent verification</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        COPPA-style verifiable parental consent: confirm you are an adult before creating
        child profiles. Choose card verification (recommended) or configure
        server-side KBA.
      </p>

      {banner ? (
        <p
          className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
            bannerTone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : bannerTone === "err"
                ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                : "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          {banner}
        </p>
      ) : null}

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Option A — Card verification ($0.50)</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          One-time USD charge via Stripe Checkout. Configure{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
            STRIPE_SECRET_KEY
          </code>
          ,{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
            STRIPE_WEBHOOK_SECRET
          </code>
          , and point the Stripe webhook to{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
            /api/webhooks/stripe
          </code>{" "}
          (event:{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
            checkout.session.completed
          </code>
          ).
        </p>
        <button
          type="button"
          disabled={stripeLoading}
          onClick={() => void startStripe()}
          className="mt-4 rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {stripeLoading ? "Redirecting…" : "Continue with Stripe"}
        </button>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Option B — Knowledge-based authentication (demo)</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Answers are checked server-side against a salted SHA-256 hash (
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
            VPC_KBA_EXPECTED_HASH
          </code>
          ). Replace this flow with a certified KBA/identity vendor in production.
        </p>
        {!kbaConfigured ? (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
            KBA is not configured on the server.
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-4">
          {questions.map((q, i) => (
            <label key={q.id} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{q.label}</span>
              <input
                type="text"
                autoComplete="off"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={i === 0 ? q1 : i === 1 ? q2 : q3}
                onChange={(e) => {
                  const v = e.target.value;
                  if (i === 0) setQ1(v);
                  else if (i === 1) setQ2(v);
                  else setQ3(v);
                }}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={kbaLoading || !kbaConfigured}
          onClick={() => void submitKba()}
          className="mt-6 rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          {kbaLoading ? "Submitting…" : "Submit KBA answers"}
        </button>
      </section>

      <p className="mt-10 text-sm">
        <a href="/parent/dashboard" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Back to dashboard
        </a>
      </p>
    </main>
  );
}
