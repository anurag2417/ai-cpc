export type ParentAgentSettingsRow = {
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  iana_timezone: string;
};

function minutesSinceMidnightInTimezone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value);
    if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}

/** Parse Postgres TIME or HTML time "HH:MM" / "HH:MM:SS" to minutes. */
export function parseTimeToMinutes(t: string): number {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return (h % 24) * 60 + (m % 60);
}

/**
 * True when the agent should be disabled (quiet hours / bedtime).
 * Overnight window when start > end (e.g. 21:00–07:00).
 */
export function isAgentDisabledByQuietHours(
  now: Date,
  settings: Pick<
    ParentAgentSettingsRow,
    "quiet_hours_enabled" | "quiet_start" | "quiet_end" | "iana_timezone"
  >
): boolean {
  if (!settings.quiet_hours_enabled) return false;

  let tz = settings.iana_timezone?.trim() || "UTC";
  try {
    minutesSinceMidnightInTimezone(now, tz);
  } catch {
    tz = "UTC";
  }

  const mins = minutesSinceMidnightInTimezone(now, tz);
  const start = parseTimeToMinutes(settings.quiet_start);
  const end = parseTimeToMinutes(settings.quiet_end);

  if (start === end) return false;

  if (start < end) {
    return mins >= start && mins < end;
  }

  return mins >= start || mins < end;
}
