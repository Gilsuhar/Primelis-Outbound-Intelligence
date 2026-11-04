-- Prepared only: administrator transaction on the NEW project, after explicit user approval.
-- Supply preview.approved_auth_user_id and preview.approved_email through a secure session.
-- Create/confirm the approved Auth test identity separately, without email dispatch or copying users.
BEGIN;
-- Verified management target: txfxfrlhtvzwgluhnbpw / Primelis / us-west-2.
-- Match the observed cluster, not an operator-supplied project-name/session setting.
DO $target$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres' OR current_user <> 'postgres'
    OR (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(system_identifier::text, 'UTF8')), 'hex')
        FROM pg_catalog.pg_control_system()) IS DISTINCT FROM
       'a1073520e0b51853abdb5566448e35fd46a0be545c51b046e9ed98ab78ac843f' THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_TARGET_REJECTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'recycler_preview_app'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolinherit AND NOT rolreplication)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member =
      (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'recycler_preview_app'))
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public."User"'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'PREVIEW_SETUP_ROLE_NOT_READY';
  END IF;
END $target$;
DO $$
DECLARE
  approved_id uuid := current_setting('preview.approved_auth_user_id')::uuid;
  approved_email text := current_setting('preview.approved_email');
BEGIN
  IF approved_email IS NULL OR approved_email = '' OR approved_email <> lower(trim(approved_email))
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = approved_id AND email = approved_email
      AND email_confirmed_at IS NOT NULL AND NOT coalesce(is_anonymous, false)) THEN
    RAISE EXCEPTION 'PREVIEW_AUTH_BINDING_REJECTED';
  END IF;
  -- Plain INSERT deliberately rejects duplicates/conflicting bindings; never overwrite a profile.
  INSERT INTO public."User" (id, "authUserId", email, name, role, "createdAt", "updatedAt")
    VALUES ('preview-' || approved_id::text, approved_id::text, approved_email,
      'Preview reviewer', 'SALES_USER', now(), now());
  EXECUTE format('CREATE POLICY %I ON public."User" FOR SELECT TO recycler_preview_app USING ("authUserId" = %L AND email = %L AND role = ''SALES_USER'')',
    'preview_' || replace(approved_id::text, '-', ''), approved_id::text, approved_email);
END $$;
COMMIT;
