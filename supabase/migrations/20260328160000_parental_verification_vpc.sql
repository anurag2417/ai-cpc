-- Verifiable Parental Consent (VPC): block child_profiles until parent is verified.

ALTER TABLE public.parent_profiles
  ADD COLUMN IF NOT EXISTS is_parent_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.parent_profiles
  ADD COLUMN IF NOT EXISTS parent_verified_at timestamptz;

ALTER TABLE public.parent_profiles
  ADD COLUMN IF NOT EXISTS verification_method text;

ALTER TABLE public.parent_profiles
  ADD CONSTRAINT parent_profiles_verification_method_check CHECK (
    verification_method IS NULL
    OR verification_method IN ('stripe_card', 'kba')
  );

COMMENT ON COLUMN public.parent_profiles.is_parent_verified IS
'COPPA-style VPC gate: child_profiles INSERT requires true.';

-- Replace broad child_profiles policy with split policies + verification on INSERT.
DROP POLICY IF EXISTS "Parents see own children" ON public.child_profiles;

CREATE POLICY "Parents select own children"
ON public.child_profiles
FOR SELECT
TO authenticated
USING (parent_id = (SELECT auth.uid ()));

CREATE POLICY "Parents insert children when verified"
ON public.child_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  parent_id = (SELECT auth.uid ())
  AND EXISTS (
    SELECT 1
    FROM public.parent_profiles p
    WHERE
      p.id = (SELECT auth.uid ())
      AND p.is_parent_verified = true
  )
);

CREATE POLICY "Parents update own children"
ON public.child_profiles
FOR UPDATE
TO authenticated
USING (parent_id = (SELECT auth.uid ()))
WITH CHECK (parent_id = (SELECT auth.uid ()));

CREATE POLICY "Parents delete own children"
ON public.child_profiles
FOR DELETE
TO authenticated
USING (parent_id = (SELECT auth.uid ()));
