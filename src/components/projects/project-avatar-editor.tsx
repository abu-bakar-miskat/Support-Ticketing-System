"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { uploadAdminProjectAvatar } from "@/lib/api/admin";
import { validateProjectIcon, PROJECT_ICON_ACCEPT } from "@/lib/project-icon";
import { projectDetailsKeys } from "@/hooks/queries/use-project-details";
import type { ProjectDetailsResponse } from "@/lib/api/projects";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  detailsQueryKey?: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: number;
  canEdit?: boolean;
  className?: string;
};

export function ProjectAvatarEditor({
  projectId,
  detailsQueryKey,
  name,
  color,
  avatarUrl: initialAvatarUrl,
  size = 28,
  canEdit = false,
  className,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl);
  }, [initialAvatarUrl]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateProjectIcon(file);
    if (validationError) {
      toast.error(validationError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const data = await uploadAdminProjectAvatar(projectId, file);
      setAvatarUrl(data.avatarUrl);

      const cacheKey = detailsQueryKey ?? projectId;
      queryClient.setQueryData<ProjectDetailsResponse>(
        projectDetailsKeys.detail(cacheKey),
        (current) =>
          current
            ? {
                ...current,
                project: { ...current.project, avatarUrl: data.avatarUrl },
              }
            : current,
      );

      toast.success("Project icon updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!canEdit) {
    return (
      <ProjectAvatar
        name={name}
        color={color}
        avatarUrl={avatarUrl}
        size={size}
        className={className}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Change project icon"
        aria-label="Change project icon"
        className={cn(
          "group relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-id",
          className,
        )}
      >
        <ProjectAvatar name={name} color={color} avatarUrl={avatarUrl} size={size} />
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin text-white" />
          ) : (
            <ImagePlus className="size-3.5 text-white" strokeWidth={2} />
          )}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PROJECT_ICON_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
