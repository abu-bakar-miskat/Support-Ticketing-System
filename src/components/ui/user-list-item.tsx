"use client";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  formatUserListSubtitle,
  type UserListPerson,
} from "@/lib/user-list-person";

/** Use on <button> rows that wrap UserListItem — avoids centered text in wide flex rows. */
export const userListPickerButtonClass =
  "flex w-full min-w-0 items-center gap-2 text-left justify-start";

type Props = {
  person: Pick<
    UserListPerson,
    "id" | "name" | "avatarUrl" | "departmentName" | "teamName"
  >;
  avatarSize?: number;
  className?: string;
  nameClassName?: string;
  subtitleClassName?: string;
  trailing?: React.ReactNode;
};

export function UserListItem({
  person,
  avatarSize = 24,
  className,
  nameClassName,
  subtitleClassName,
  trailing,
}: Props) {
  const subtitle = formatUserListSubtitle(
    person.departmentName,
    person.teamName,
  );

  return (
    <span
      className={cn(
        "inline-flex w-full min-w-0 items-center gap-2.5 text-left",
        className,
      )}
    >
      <UserAvatar
        name={person.name}
        avatarUrl={person.avatarUrl}
        userId={person.id}
        size={avatarSize}
      />
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block truncate text-left font-sans text-[12px] font-semibold text-pen-foreground",
            nameClassName,
          )}
        >
          {person.name}
        </span>
        {subtitle && (
          <span
            className={cn(
              "block truncate text-left font-sans text-[11.5px] text-pen-subtle",
              subtitleClassName,
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </span>
  );
}
