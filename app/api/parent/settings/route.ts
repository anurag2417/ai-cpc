import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_PARENT_AGENT_SETTINGS,
  mergeAgentSettings,
  type ParentAgentSettingsDTO,
} from "@/lib/parent/defaults";
import { TOPIC_MODES, type TopicMode } from "@/lib/parent/topics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const putSchema = z.object({
  quiet_hours_enabled: z.boolean(),
  quiet_start: z.string().min(4).max(12),
  quiet_end: z.string().min(4).max(12),
  iana_timezone: z.string().min(2).max(64),
  allowed_topics: z
    .array(z.enum(TOPIC_MODES))
    .min(1, "Select at least one topic mode."),
});

function toPgTime(s: string): string {
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("parent_agent_settings")
    .select("*")
    .eq("parent_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load settings", detail: error.message },
      { status: 500 }
    );
  }

  const settings = mergeAgentSettings(row as Partial<ParentAgentSettingsDTO> | null);

  return NextResponse.json({
    settings,
    persisted: Boolean(row),
  });
}

export async function PUT(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = parsed.data;
  const payload = {
    parent_id: user.id,
    quiet_hours_enabled: body.quiet_hours_enabled,
    quiet_start: toPgTime(body.quiet_start),
    quiet_end: toPgTime(body.quiet_end),
    iana_timezone: body.iana_timezone,
    allowed_topics: body.allowed_topics as TopicMode[],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("parent_agent_settings")
    .upsert(payload, { onConflict: "parent_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save settings", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    settings: mergeAgentSettings(data as Partial<ParentAgentSettingsDTO>),
    persisted: true,
    defaults: DEFAULT_PARENT_AGENT_SETTINGS,
  });
}
