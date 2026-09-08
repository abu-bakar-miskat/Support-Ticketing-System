-- Fix handle_new_user trigger: it still inserts Profile.role = 'staff', but the
-- 'staff' Role enum value was renamed to 'agent' in
-- 20260906140000_rename_role_enum_values. Postgres RENAME VALUE does NOT rewrite
-- string literals inside stored function bodies, so the trigger now inserts an
-- enum value that no longer exists. Every new signup (e.g. an invited user
-- logging in for the first time) fails with:
--   invalid input value for enum "Role": "staff"
-- which Supabase surfaces to the client as "Database error saving new user".
--
-- This CREATE OR REPLACE keeps the existing soft-delete re-link logic from
-- 20260701130000_restore_deleted_user_login and only changes the inserted role
-- literal from 'staff' to 'agent'.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public
    AS $fn$
    DECLARE
      existing_id uuid;
      existing_deleted timestamptz;
      v_name text;
    BEGIN
      v_name := COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
      );

      SELECT id, "deletedAt" INTO existing_id, existing_deleted
      FROM public."Profile"
      WHERE email = NEW.email;

      IF existing_id IS NOT NULL THEN
        IF existing_id IS DISTINCT FROM NEW.id THEN
          IF existing_deleted IS NOT NULL THEN
            PERFORM public.migrate_profile_auth_id(existing_id, NEW.id);
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'Profile email already registered to another account';
        END IF;

        UPDATE public."Profile"
        SET "deletedAt" = NULL,
            name = v_name,
            email = NEW.email
        WHERE id = NEW.id;
        RETURN NEW;
      END IF;

      INSERT INTO public."Profile" (id, email, name, role, "createdAt")
      VALUES (NEW.id, NEW.email, v_name, 'agent', NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        "deletedAt" = NULL;

      RETURN NEW;
    END;
    $fn$;
  END IF;
END;
$$;
