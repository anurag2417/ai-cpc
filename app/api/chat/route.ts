import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/ai/openaiClient";
import { moderateUserPrompt } from "@/lib/ai/inputModeration";
import { guardrailLLMOutput } from "@/lib/ai/outputGuardrail";
import {
  mergeAgentSettings,
  type ParentAgentSettingsDTO,
} from "@/lib/parent/defaults";
import { isAgentDisabledByQuietHours } from "@/lib/parent/timeWindow";
import {
  isTopicAllowed,
  topicSystemPreamble,
  type TopicMode,
} from "@/lib/parent/topics";
import { recordSentimentAlertsFromChildMessage } from "@/lib/sentiment/sentimentAlerts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().max(32000),
        })
      )
      .min(1),
    childId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional().nullable(),
    mode: z.enum(["education", "storytelling"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.childId && !data.mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mode"],
        message: "mode is required when childId is set",
      });
    }
  });

function lastUserContent(
  messages: z.infer<typeof bodySchema>["messages"]
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return null;
}

/**
 * AI agent endpoint: optional parent controls (quiet hours, topic whitelist),
 * sentiment keyword alerts, input moderation → LLM → output guardrails.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { messages, childId, conversationId, mode } = parsed.data;
  const latestUser = lastUserContent(messages);
  if (!latestUser) {
    return NextResponse.json(
      { error: "At least one user message is required." },
      { status: 400 }
    );
  }

  if (childId) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Sign in to use child-scoped chat." },
        { status: 401 }
      );
    }

    const { data: child, error: childError } = await supabase
      .from("child_profiles")
      .select("id, parent_id")
      .eq("id", childId)
      .eq("parent_id", user.id)
      .maybeSingle();

    if (childError || !child) {
      return NextResponse.json(
        { error: "child_not_found_or_forbidden" },
        { status: 403 }
      );
    }

    const { data: settingsRow } = await supabase
      .from("parent_agent_settings")
      .select("*")
      .eq("parent_id", user.id)
      .maybeSingle();

    const settings = mergeAgentSettings(
      settingsRow as Partial<ParentAgentSettingsDTO> | null
    );

    await recordSentimentAlertsFromChildMessage(supabase, {
      parentId: user.id,
      childId,
      conversationId: conversationId ?? null,
      messageId: null,
      userText: latestUser,
    });

    if (isAgentDisabledByQuietHours(new Date(), settings)) {
      return NextResponse.json(
        {
          error: "agent_disabled_quiet_hours",
          message:
            "The assistant is paused during quiet hours set by your parent.",
        },
        { status: 403 }
      );
    }

    const topicMode = mode as TopicMode;
    if (!isTopicAllowed(topicMode, settings.allowed_topics)) {
      return NextResponse.json(
        {
          error: "topic_not_allowed",
          message:
            "This topic mode is not enabled for your profile. Ask a parent to update topic settings.",
          allowed_topics: settings.allowed_topics,
        },
        { status: 403 }
      );
    }
  }

  const inputCheck = await moderateUserPrompt(latestUser);
  if (!inputCheck.allowed) {
    return NextResponse.json(
      {
        error: "input_blocked",
        reason: inputCheck.reason,
        layer: inputCheck.layer,
      },
      { status: 422 }
    );
  }

  const openai = getOpenAI();
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

  const messagesForModel =
    childId && mode
      ? [
          { role: "system" as const, content: topicSystemPreamble(mode) },
          ...messages,
        ]
      : messages;

  const completion = await openai.chat.completions.create({
    model,
    messages: messagesForModel,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const guarded = await guardrailLLMOutput(raw, {
    prependReminderOnWarnings: true,
  });

  return NextResponse.json({
    message: {
      role: "assistant" as const,
      content: guarded.text,
    },
    guardrail: {
      blocked: guarded.blocked,
      warnings: guarded.warnings,
      blockReason: guarded.blockReason,
    },
    usage: completion.usage,
    model: completion.model,
  });
}
