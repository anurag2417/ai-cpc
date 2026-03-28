-- Parent dashboard: quiet hours, topic whitelist, sentiment alerts

CREATE TABLE public.parent_agent_settings (
  parent_id uuid PRIMARY KEY REFERENCES public.parent_profiles (id) ON DELETE CASCADE,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_start time NOT NULL DEFAULT '21:00:00',
  quiet_end time NOT NULL DEFAULT '07:00:00',
  iana_timezone text NOT NULL DEFAULT 'UTC',
  allowed_topics text[] NOT NULL DEFAULT ARRAY['education', 'storytelling']::text[],
  updated_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT parent_agent_settings_topics_subset CHECK (
    allowed_topics <@ ARRAY['education', 'storytelling']::text[]
    AND cardinality(allowed_topics) >= 1
  )
);

CREATE TYPE public.sentiment_alert_kind AS ENUM ('high_distress', 'loneliness');

CREATE TABLE public.sentiment_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  parent_id uuid NOT NULL REFERENCES public.parent_profiles (id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.child_profiles (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages (id) ON DELETE SET NULL,
  alert_kind public.sentiment_alert_kind NOT NULL,
  matched_terms text[] NOT NULL DEFAULT '{}'::text[],
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX sentiment_alerts_parent_created_idx ON public.sentiment_alerts (
  parent_id,
  created_at DESC
);

CREATE INDEX sentiment_alerts_parent_unread_idx ON public.sentiment_alerts (parent_id)
  WHERE
    dismissed_at IS NULL;

ALTER TABLE public.parent_agent_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sentiment_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents manage own agent settings"
ON public.parent_agent_settings
FOR ALL
TO authenticated
USING (parent_id = (SELECT auth.uid ()))
WITH CHECK (parent_id = (SELECT auth.uid ()));

CREATE POLICY "Parents select own sentiment alerts"
ON public.sentiment_alerts
FOR SELECT
TO authenticated
USING (parent_id = (SELECT auth.uid ()));

CREATE POLICY "Parents update own sentiment alerts"
ON public.sentiment_alerts
FOR UPDATE
TO authenticated
USING (parent_id = (SELECT auth.uid ()))
WITH CHECK (parent_id = (SELECT auth.uid ()));

CREATE POLICY "Parents insert sentiment alerts for own children"
ON public.sentiment_alerts
FOR INSERT
TO authenticated
WITH CHECK (
  parent_id = (SELECT auth.uid ())
  AND EXISTS (
    SELECT 1
    FROM public.child_profiles c
    WHERE
      c.id = sentiment_alerts.child_id
      AND c.parent_id = (SELECT auth.uid ())
  )
);
