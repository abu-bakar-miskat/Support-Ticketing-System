-- Remove invalid IntakeFormConfig.createdById update (column does not exist).

CREATE OR REPLACE FUNCTION public.migrate_profile_auth_id(old_id uuid, new_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF old_id = new_id THEN
    RETURN;
  END IF;

  SELECT email INTO v_email FROM public."Profile" WHERE id = old_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public."Profile"
  SET email = 'orphan-' || old_id::text || '@deleted.local'
  WHERE id = old_id;

  INSERT INTO public."Profile" (
    id, email, name, role, "avatarUrl", "teamId", "createdAt",
    timezone, "notificationPrefs", preferences, "deletedAt"
  )
  SELECT
    new_id, v_email, name, role, "avatarUrl", "teamId", "createdAt",
    timezone, "notificationPrefs", preferences, NULL
  FROM public."Profile"
  WHERE id = old_id;

  UPDATE public."DepartmentManager" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."DepartmentManager" SET "assignedBy" = new_id WHERE "assignedBy" = old_id;
  UPDATE public."DepartmentAccess" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."DepartmentAccess" SET "grantedBy" = new_id WHERE "grantedBy" = old_id;
  UPDATE public."TeamMembership" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."JoinRequest" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."JoinRequest" SET "processedBy" = new_id WHERE "processedBy" = old_id;
  UPDATE public."TicketAssignee" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."ProjectMember" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."Ticket" SET "assigneeId" = new_id WHERE "assigneeId" = old_id;
  UPDATE public."Ticket" SET "creatorId" = new_id WHERE "creatorId" = old_id;
  UPDATE public."Comment" SET "authorId" = new_id WHERE "authorId" = old_id;
  UPDATE public."Attachment" SET "uploaderProfileId" = new_id WHERE "uploaderProfileId" = old_id;
  UPDATE public."Mention" SET "mentionedUserId" = new_id WHERE "mentionedUserId" = old_id;
  UPDATE public."ActivityLog" SET "actorId" = new_id WHERE "actorId" = old_id;
  UPDATE public."Sprint" SET "createdById" = new_id WHERE "createdById" = old_id;
  UPDATE public."TimeEntry" SET "profileId" = new_id WHERE "profileId" = old_id;
  UPDATE public."Notification" SET "recipientId" = new_id WHERE "recipientId" = old_id;
  UPDATE public."Notification" SET "actorId" = new_id WHERE "actorId" = old_id;
  UPDATE public."PushSubscription" SET "userId" = new_id WHERE "userId" = old_id;
  UPDATE public."ApiKey" SET "createdById" = new_id WHERE "createdById" = old_id;

  DELETE FROM public."Profile" WHERE id = old_id;
END;
$$;
