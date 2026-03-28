import { TOPIC_MODES, type TopicMode } from "@/lib/parent/topics";

export type ParentAgentSettingsDTO = {
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  iana_timezone: string;
  allowed_topics: TopicMode[];
};

export const DEFAULT_PARENT_AGENT_SETTINGS: ParentAgentSettingsDTO = {
  quiet_hours_enabled: false,
  quiet_start: "21:00:00",
  quiet_end: "07:00:00",
  iana_timezone: "UTC",
  allowed_topics: ["education", "storytelling"],
};

function normalizeTopics(raw: unknown): TopicMode[] {
  if (!Array.isArray(raw)) return DEFAULT_PARENT_AGENT_SETTINGS.allowed_topics;
  const set = new Set(TOPIC_MODES);
  const out = raw.filter((t): t is TopicMode => typeof t === "string" && set.has(t as TopicMode));
  return out.length > 0 ? out : DEFAULT_PARENT_AGENT_SETTINGS.allowed_topics;
}

export function mergeAgentSettings(
  row: Partial<ParentAgentSettingsDTO> | null
): ParentAgentSettingsDTO {
  if (!row) return { ...DEFAULT_PARENT_AGENT_SETTINGS };
  return {
    ...DEFAULT_PARENT_AGENT_SETTINGS,
    ...row,
    allowed_topics: normalizeTopics(row.allowed_topics),
  };
}
