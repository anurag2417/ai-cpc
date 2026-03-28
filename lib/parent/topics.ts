export const TOPIC_MODES = ["education", "storytelling"] as const;

export type TopicMode = (typeof TOPIC_MODES)[number];

export function isTopicAllowed(
  mode: TopicMode,
  allowed: TopicMode[]
): boolean {
  return allowed.includes(mode);
}

export function topicSystemPreamble(mode: TopicMode): string {
  if (mode === "education") {
    return (
      "You are a friendly, age-appropriate tutor. Keep answers educational, short, and " +
      "encourage curiosity. Never ask for or share personal contact information."
    );
  }
  return (
    "You are a storyteller for children. Tell imaginative, safe, age-appropriate " +
    "stories without scary violence or mature themes. Never ask for personal information."
  );
}
