"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ParentAgentSettingsDTO } from "@/lib/parent/defaults";
import { COMMON_IANA_TIMEZONES } from "@/lib/parent/timezones";
import { TOPIC_MODES, type TopicMode } from "@/lib/parent/topics";

type AlertRow = {
  id: string;
  alert_kind: "high_distress" | "loneliness";
  matched_terms: string[];
  dismissed_at: string | null;
  created_at: string;
  child_id: string;
  child_display_ordinal: number | null;
};

function formatTimeForInput(pgTime: string): string {
  if (pgTime.length >= 5) return pgTime.slice(0, 5);
  return pgTime;
}

function labelForKind(kind: AlertRow["alert_kind"]): string {
  if (kind === "high_distress") return "High distress";
  return "Loneliness";
}

export default function ParentDashboardPage() {
  const [settings, setSettings] = useState<ParentAgentSettingsDTO | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    setLoadError(null);
    try {
      const res = await fetch("/api/parent/settings", { credentials: "same-origin" });
      if (res.status === 401) {
        setAuthError(true);
        setSettings(null);
        return;
      }
      if (!res.ok) throw new Error("Failed to load settings");
      const data = (await res.json()) as {
        settings: ParentAgentSettingsDTO;
        persisted: boolean;
      };
      setSettings(data.settings);
      setPersisted(data.persisted);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Load failed");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/parent/alerts", { credentials: "same-origin" });
      if (res.status === 401) {
        setAlerts([]);
        return;
      }
      if (!res.ok) throw new Error("Failed to load alerts");
      const data = (await res.json()) as { alerts: AlertRow[] };
      setAlerts(data.alerts);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadAlerts();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [loadAlerts]);

  const updateTopic = (topic: TopicMode, enabled: boolean) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.allowed_topics);
      if (enabled) next.add(topic);
      else next.delete(topic);
      if (next.size === 0) return prev;
      return { ...prev, allowed_topics: Array.from(next) as TopicMode[] };
    });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/parent/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiet_hours_enabled: settings.quiet_hours_enabled,
          quiet_start: formatTimeForInput(settings.quiet_start),
          quiet_end: formatTimeForInput(settings.quiet_end),
          iana_timezone: settings.iana_timezone,
          allowed_topics: settings.allowed_topics,
        }),
      });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        const body = (await res.json()) as { detail?: string };
        throw new Error(body.detail ?? "Save failed");
      }
      const data = (await res.json()) as { settings: ParentAgentSettingsDTO };
      setSettings(data.settings);
      setPersisted(true);
      setSavedAt(new Date());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dismissAlert = async (id: string) => {
    const res = await fetch(`/api/parent/alerts/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
    });
    if (res.ok) void loadAlerts();
  };

  const openAlerts = useMemo(
    () => alerts.filter((a) => !a.dismissed_at),
    [alerts]
  );

  if (loading && !settings && !loadError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-zinc-500">Loading parent dashboard…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Parent dashboard</h1>
        <p className="mt-3 text-red-600 dark:text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="mt-6 rounded-full border border-zinc-300 px-5 py-2 text-sm dark:border-zinc-600"
        >
          Retry
        </button>
      </main>
    );
  }

  if (authError || !settings) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Parent dashboard</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Sign in with your parent account to manage quiet hours, allowed topics, and
          sentiment alerts.
        </p>
        <a
          href="/login"
          className="mt-6 inline-flex rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Go to sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Parent dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Time-box the assistant, choose safe topic modes, and review live keyword-based
          sentiment alerts from your child&apos;s chats. Alerts are heuristic, not a
          diagnosis—use them to start a conversation with your child.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Quiet hours (bedtime)</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              When enabled, the agent refuses chats during this window in your selected
              timezone (overnight ranges like 21:00–07:00 are supported).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.quiet_hours_enabled}
            onClick={() =>
              setSettings((s) =>
                s ? { ...s, quiet_hours_enabled: !s.quiet_hours_enabled } : s
              )
            }
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
              settings.quiet_hours_enabled
                ? "bg-emerald-600"
                : "bg-zinc-300 dark:bg-zinc-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-7 w-7 translate-y-0 rounded-full bg-white shadow transition ${
                settings.quiet_hours_enabled ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Start</span>
            <input
              type="time"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={formatTimeForInput(settings.quiet_start)}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, quiet_start: e.target.value } : s))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">End</span>
            <input
              type="time"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={formatTimeForInput(settings.quiet_end)}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, quiet_end: e.target.value } : s))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Timezone</span>
            <select
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={settings.iana_timezone}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, iana_timezone: e.target.value } : s))
              }
            >
              {COMMON_IANA_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Topic whitelist</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The child app must send a mode with each chat. At least one mode must stay
          enabled.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {TOPIC_MODES.map((topic) => {
            const checked = settings.allowed_topics.includes(topic);
            return (
              <li key={topic}>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-zinc-400"
                    checked={checked}
                    onChange={(e) => updateTopic(topic, e.target.checked)}
                  />
                  <span className="capitalize">{topic}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {persisted ? (
          <span className="text-xs text-zinc-500">
            {savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Synced with your account"}
          </span>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Defaults shown — save to store on your account (requires parent profile).
          </span>
        )}
        {saveError ? (
          <span className="text-sm text-red-600 dark:text-red-400">{saveError}</span>
        ) : null}
      </div>

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium">Live sentiment alerts</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Keyword-based flags for high distress or loneliness. Refreshes every 30
              seconds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAlerts()}
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            Refresh
          </button>
        </div>

        {alertsLoading ? (
          <p className="mt-6 text-sm text-zinc-500">Loading alerts…</p>
        ) : openAlerts.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">No open alerts. You’re all set.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {openAlerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        a.alert_kind === "high_distress"
                          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                      }`}
                    >
                      {labelForKind(a.alert_kind)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Child {a.child_display_ordinal ?? "—"} ·{" "}
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">Matched terms</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.matched_terms.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void dismissAlert(a.id)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
