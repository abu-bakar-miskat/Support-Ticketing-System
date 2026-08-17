"use client";

import { useLayoutEffect } from "react";
import { useAuthStore } from "@/store";
import type { Role } from "@/generated/prisma/enums";

type UserHydratorProps = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  teamId: string | null;
  teamIds: string[];
  memberships: { teamId: string; role: string }[];
};

export function UserHydrator(props: UserHydratorProps) {
  const setUser = useAuthStore((s) => s.setUser);

  useLayoutEffect(() => {
    setUser({
      id: props.id,
      email: props.email,
      name: props.name ?? "",
      avatarUrl: props.avatarUrl,
      role: props.role,
      teamId: props.teamId,
      teamIds: props.teamIds,
      memberships: props.memberships,
    });
    return () => setUser(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
