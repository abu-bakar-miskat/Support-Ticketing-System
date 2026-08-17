-- Allow soft-deleted users to sign in again.
-- When auth.users was deleted and OAuth re-creates a row with a new UUID, the
-- handle_new_user trigger re-links the existing Profile instead of failing on
-- the unique email constraint.

CREATE OR REPLACE FUNCTION public.migrate_profile_auth_id(old_id uuid, new_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF old_id = new_id THEN
    RETURN;
  END IF;

  UPDATE "DepartmentManager" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "DepartmentManager" SET "assignedBy" = new_id WHERE "assignedBy" = old_id;
  UPDATE "DepartmentAccess" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "DepartmentAccess" SET "grantedBy" = new_id WHERE "grantedBy" = old_id;
  UPDATE "TeamMembership" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "JoinRequest" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "JoinRequest" SET "processedBy" = new_id WHERE "processedBy" = old_id;
  UPDATE "TicketAssignee" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "ProjectMember" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "Ticket" SET "assigneeId" = new_id WHERE "assigneeId" = old_id;
  UPDATE "Ticket" SET "creatorId" = new_id WHERE "creatorId" = old_id;
  UPDATE "Comment" SET "authorId" = new_id WHERE "authorId" = old_id;
  UPDATE "Attachment" SET "uploaderProfileId" = new_id WHERE "uploaderProfileId" = old_id;
  UPDATE "Mention" SET "mentionedUserId" = new_id WHERE "mentionedUserId" = old_id;
  UPDATE "ActivityLog" SET "actorId" = new_id WHERE "actorId" = old_id;
  UPDATE "Sprint" SET "createdById" = new_id WHERE "createdById" = old_id;
  UPDATE "TimeEntry" SET "profileId" = new_id WHERE "profileId" = old_id;
  UPDATE "Notification" SET "recipientId" = new_id WHERE "recipientId" = old_id;
  UPDATE "Notification" SET "actorId" = new_id WHERE "actorId" = old_id;
  UPDATE "PushSubscription" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE "ApiKey" SET "createdById" = new_id WHERE "createdById" = old_id;
  UPDATE "IntakeFormConfig" SET "createdById" = new_id WHERE "createdById" = old_id;

  UPDATE "Profile"
  SET id = new_id, "deletedAt" = NULL
  WHERE id = old_id;
END;
$$;

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
      VALUES (NEW.id, NEW.email, v_name, 'staff', NOW())
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
