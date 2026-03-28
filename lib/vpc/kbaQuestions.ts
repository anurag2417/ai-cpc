/** Display-only prompts for the KBA form (answers verified server-side). */
export const KBA_QUESTIONS = [
  {
    id: "q1",
    label:
      "Security question 1: What is your current state or region of residence? (full name)",
  },
  {
    id: "q2",
    label:
      "Security question 2: In what year were you born? (YYYY — replace with vendor KBA in production)",
  },
  {
    id: "q3",
    label:
      "Security question 3: Name the school district you attended (or last 4 digits of a reference you chose offline — demo only).",
  },
] as const;
