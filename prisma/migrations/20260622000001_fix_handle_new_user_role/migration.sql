-- Fix handle_new_user trigger: it was inserting with role = 'developer',
-- which is no longer a valid Role enum value. Change to 'staff'.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public."Profile" (id, email, name, role, "createdAt")
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
          NEW.raw_user_meta_data->>'name',
          NEW.raw_user_meta_data->>'full_name',
          split_part(NEW.email, '@', 1)
        ),
        'staff',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $fn$;
  END IF;
END;
$$;
