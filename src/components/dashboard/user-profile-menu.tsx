"use client";

import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  CircleUser,
  LogOut,
  Settings2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store";
import { cn } from "@/lib/utils";

function roleAvatarRingColor(role: string | undefined) {
  switch (role) {
    case "admin":
      return "ring-[#0a76b9]";
    case "manager":
      return "ring-[#a855f7]";
    case "sub_manager":
      return "ring-[#10b981]";
    default:
      return "ring-[#94a3b8]";
  }
}

function UserAvatar({
  userName,
  userAvatarUrl,
  role,
  className,
}: {
  userName: string;
  userAvatarUrl?: string;
  role?: string;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        "size-7 ring-2 after:hidden after:border-transparent",
        roleAvatarRingColor(role),
        className,
      )}
    >
      {userAvatarUrl ? (
        <AvatarImage src={userAvatarUrl} alt={userName} />
      ) : null}
      <AvatarFallback className="bg-[#0a76b9] font-sans text-[11.5px] font-medium text-white">
        {userName.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}

function roleBadgeClass(role: string | undefined) {
  return cn(
    "shrink-0 rounded-sm px-1 py-px font-sans text-[11.5px] font-semibold uppercase tracking-wide",
    role === "admin" && "bg-pen-blue/15 text-pen-blue",
    role === "manager" && "bg-purple-500/15 text-purple-500",
    role === "sub_manager" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    role === "staff" && "bg-pen-surface text-pen-subtle",
  );
}

type UserProfileMenuProps = {
  variant?: "topbar" | "sidebar";
  collapsed?: boolean;
  profileHref?: string;
  hideSettings?: boolean;
};

export function UserProfileMenu({
  variant = "topbar",
  collapsed = false,
  profileHref = "/profile",
  hideSettings = false,
}: UserProfileMenuProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userName = user?.name ?? "User";
  const userEmail = user?.email ?? "";
  const userAvatarUrl = user?.avatarUrl ?? undefined;
  const isTopBar = variant === "topbar";

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={`User menu for ${userName}`}
        title={isTopBar || collapsed ? userName : undefined}
        className={cn(
          "outline-none transition-colors",
          isTopBar
            ? "flex size-8 items-center justify-center rounded-full hover:bg-pen-bg data-popup-open:bg-pen-bg"
            : cn(
                "flex w-full items-center rounded-lg text-left",
                "hover:bg-pen-blue-tint data-popup-open:bg-pen-blue-tint",
                collapsed ? "justify-center p-1.5" : "gap-2 p-2",
              ),
        )}
      >
        <UserAvatar
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          role={user?.role}
          className={isTopBar ? "size-7" : undefined}
        />
        {!isTopBar && !collapsed && (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                  {userName}
                </span>
                <span className={roleBadgeClass(user?.role)}>
                  {user?.role === "sub_manager" ? "sub-manager" : (user?.role ?? "staff")}
                </span>
              </div>
              <span className="truncate font-sans text-[11.5px] text-pen-subtle">
                {userEmail}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-pen-subtle" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(
          "min-w-56 w-auto rounded-lg font-sans",
          "[&_[data-slot=dropdown-menu-item]]:text-[12.5px] [&_[data-slot=dropdown-menu-item]]:text-pen-foreground",
          "[&_[data-slot=dropdown-menu-item]]:focus:bg-pen-blue-tint [&_[data-slot=dropdown-menu-item]]:focus:text-pen-foreground",
        )}
        side={isTopBar ? "bottom" : "right"}
        align="end"
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <UserAvatar
                userName={userName}
                userAvatarUrl={userAvatarUrl}
                role={user?.role}
              />
              <div className="grid min-w-0 flex-1 leading-tight">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-sans text-sm font-semibold text-pen-foreground">
                    {userName}
                  </span>
                  <span className={roleBadgeClass(user?.role)}>
                    {user?.role === "sub_manager" ? "sub-manager" : (user?.role ?? "staff")}
                  </span>
                </div>
                <span className="truncate font-sans text-xs text-pen-subtle">
                  {userEmail}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(profileHref)}>
          <CircleUser />
          My profile
        </DropdownMenuItem>
        {!hideSettings && (
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings2 />
            Settings
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
