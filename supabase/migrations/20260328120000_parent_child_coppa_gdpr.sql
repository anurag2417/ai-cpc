-- Parent / Child separation: parent holds PII; child_profile stores no direct PII.
-- Conversations and messages are keyed only by child_id; deletion cascades for erasure.

-- ---------------------------------------------------------------------------
-- Parent: PII lives here (email, legal name, contact) — COPPA/GDPR parent-of-record
-- ---------------------------------------------------------------------------
CREATE TABLE public.parent_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  locale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_profiles_email_check CHECK (
    email IS NULL OR char_length(email) <= 320
  )
);

CREATE INDEX parent_profiles_email_idx ON public.parent_profiles (email)
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Child: NO direct PII — no name, DOB, email, photo URL, address, school, etc.
-- Only pseudonymous id, parent link, coarse age band, non-identifying UX prefs.
-- ---------------------------------------------------------------------------
CREATE TYPE public.child_age_band AS ENUM (
  'under_5',
  'age_5_7',
  'age_8_10',
  'age_11_12',
  'age_13_15',
  'age_16_17'
);

CREATE TABLE public.child_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  parent_id uuid NOT NULL REFERENCES public.parent_profiles (id) ON DELETE CASCADE,
  age_band public.child_age_band NOT NULL,
  -- Ordinal for parent UI ("Child 1") — not a name or nickname
  display_ordinal smallint NOT NULL DEFAULT 1 CHECK (
    display_ordinal >= 1 AND display_ordinal <= 99
  ),
  -- BCP-47 language tag optional; avoid free-text location fields
  preferred_locale text CHECK (
    preferred_locale IS NULL OR preferred_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'
  ),
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now (),
  CONSTRAINT child_profiles_parent_ordinal UNIQUE (parent_id, display_ordinal)
);

CREATE INDEX child_profiles_parent_id_idx ON public.child_profiles (parent_id);

-- ---------------------------------------------------------------------------
-- Conversations & messages (content may still be sensitive; wiped on child delete)
-- ---------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  child_id uuid NOT NULL REFERENCES public.child_profiles (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now (),
  ended_at timestamptz,
  -- Optional model identifier — not PII
  model_id text,
  CONSTRAINT conversations_time_check CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
);

CREATE INDEX conversations_child_id_idx ON public.conversations (child_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content text NOT NULL,
  -- Token counts, tool names, etc. — must not contain PII by application policy
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX messages_conversation_id_idx ON public.messages (conversation_id);

-- Non-PII analytics keyed by child (wiped with child)
CREATE TABLE public.child_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  child_id uuid NOT NULL REFERENCES public.child_profiles (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX child_event_logs_child_id_idx ON public.child_event_logs (child_id);

-- ---------------------------------------------------------------------------
-- Deletion audit: proves erasure was requested/completed (retain minimal record)
-- ---------------------------------------------------------------------------
CREATE TYPE public.deletion_audit_status AS ENUM (
  'in_progress',
  'completed',
  'failed'
);

CREATE TABLE public.data_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  parent_id uuid NOT NULL REFERENCES public.parent_profiles (id) ON DELETE CASCADE,
  -- Snapshot of child id before row is removed (not an FK after delete)
  child_id_snapshot uuid NOT NULL,
  status public.deletion_audit_status NOT NULL DEFAULT 'in_progress',
  initiated_at timestamptz NOT NULL DEFAULT now (),
  completed_at timestamptz,
  error_message text,
  CONSTRAINT data_deletion_audit_completed CHECK (
    (status = 'in_progress' AND completed_at IS NULL)
    OR (
      status IN ('completed', 'failed')
      AND completed_at IS NOT NULL
    )
  )
);

CREATE INDEX data_deletion_audit_parent_idx ON public.data_deletion_audit (parent_id);
CREATE INDEX data_deletion_audit_child_snapshot_idx ON public.data_deletion_audit (child_id_snapshot);

-- ---------------------------------------------------------------------------
-- Atomic erasure: conversations, messages, event logs, child row (CASCADE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_child_data (p_parent_id uuid, p_child_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  -- Authenticated JWT: parent_id must match caller. Service role (server): auth.uid() is null.
  IF
    auth.uid() IS NOT NULL
    AND auth.uid() IS DISTINCT FROM p_parent_id
  THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'forbidden'
    );
  END IF;

  IF
    NOT EXISTS (
      SELECT 1
      FROM public.child_profiles c
      WHERE
        c.id = p_child_id
        AND c.parent_id = p_parent_id
    )
  THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'not_found_or_forbidden'
    );
  END IF;

  INSERT INTO public.data_deletion_audit (
    parent_id,
    child_id_snapshot,
    status
  )
  VALUES (p_parent_id, p_child_id, 'in_progress')
  RETURNING id INTO v_audit_id;

  DELETE FROM public.child_profiles
  WHERE
    id = p_child_id
    AND parent_id = p_parent_id;

  UPDATE public.data_deletion_audit
  SET
    status = 'completed',
    completed_at = now()
  WHERE
    id = v_audit_id;

  RETURN jsonb_build_object(
    'ok',
    true,
    'audit_id',
    v_audit_id
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_audit_id IS NOT NULL THEN
      UPDATE public.data_deletion_audit
      SET
        status = 'failed',
        completed_at = now (),
        error_message = left(SQLERRM, 2000)
      WHERE
        id = v_audit_id;
    END IF;

    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'deletion_failed',
      'detail',
      left(SQLERRM, 500)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_child_data (uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_child_data (uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.delete_child_data (uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS (policies assume Supabase Auth: parent_profiles.id = auth.uid())
-- ---------------------------------------------------------------------------
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.child_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.child_event_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.data_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents manage own profile"
ON public.parent_profiles
FOR ALL
TO authenticated
USING (id = (SELECT auth.uid ()))
WITH CHECK (id = (SELECT auth.uid ()));

CREATE POLICY "Parents see own children"
ON public.child_profiles
FOR ALL
TO authenticated
USING (parent_id = (SELECT auth.uid ()))
WITH CHECK (parent_id = (SELECT auth.uid ()));

CREATE POLICY "Parents see conversations for own children"
ON public.conversations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.child_profiles c
    WHERE
      c.id = conversations.child_id
      AND c.parent_id = (SELECT auth.uid ())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.child_profiles c
    WHERE
      c.id = conversations.child_id
      AND c.parent_id = (SELECT auth.uid ())
  )
);

CREATE POLICY "Parents see messages in own conversations"
ON public.messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations cv
    JOIN public.child_profiles c ON c.id = cv.child_id
    WHERE
      cv.id = messages.conversation_id
      AND c.parent_id = (SELECT auth.uid ())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations cv
    JOIN public.child_profiles c ON c.id = cv.child_id
    WHERE
      cv.id = messages.conversation_id
      AND c.parent_id = (SELECT auth.uid ())
  )
);

CREATE POLICY "Parents see own child event logs"
ON public.child_event_logs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.child_profiles c
    WHERE
      c.id = child_event_logs.child_id
      AND c.parent_id = (SELECT auth.uid ())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.child_profiles c
    WHERE
      c.id = child_event_logs.child_id
      AND c.parent_id = (SELECT auth.uid ())
  )
);

CREATE POLICY "Parents see own deletion audit"
ON public.data_deletion_audit
FOR SELECT
TO authenticated
USING (parent_id = (SELECT auth.uid ()));
