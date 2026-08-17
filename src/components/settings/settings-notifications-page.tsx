"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateNotificationPrefs } from "@/lib/api/profile";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  label: string;
  description?: string;
  defaultOn: boolean;
};

type NotificationSection = {
  title: string;
  rows: NotificationRow[];
};

const NOTIFICATION_SECTIONS: NotificationSection[] = [
  {
    title: "In-app notifications",
    rows: [
      {
        id: "mentions",
        label: "Mentions",
        description: "When someone @mentions you",
        defaultOn: true,
      },
      {
        id: "assignments",
        label: "Assignments",
        description: "When a ticket is assigned to you",
        defaultOn: true,
      },
      {
        id: "comments",
        label: "Comments on my tickets",
        defaultOn: true,
      },
      {
        id: "statusChanges",
        label: "Status changes on my tickets",
        defaultOn: false,
      },
      {
        id: "intakeManagerAlert",
        label: "New tickets from support forms",
        description: "When a ticket is auto-created from a support form for your department",
        defaultOn: true,
      },
    ],
  },
  {
    title: "Email",
    rows: [
      {
        id: "emailOnAssign",
        label: "Email me when assigned to a ticket",
        defaultOn: true,
      },
      {
        id: "emailOnMention",
        label: "Email me when mentioned",
        defaultOn: true,
      },
      {
        id: "emailOnTicketComplete",
        label: "Email me when a ticket I created is completed",
        defaultOn: true,
      },
      {
        id: "emailOnComment",
        label: "Email me on comments on my tickets",
        defaultOn: true,
      },
      {
        id: "emailOnIntakeManagerAlert",
        label: "Email me when a new support ticket needs my department's attention",
        defaultOn: true,
      },
    ],
  },
];

const DEFAULT_PREFERENCES = Object.fromEntries(
  NOTIFICATION_SECTIONS.flatMap((section) =>
    section.rows.map((row) => [row.id, row.defaultOn]),
  ),
) as Record<string, boolean>;

function NotificationToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-pen-surface py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <label
          htmlFor={id}
          className="font-sans text-[12.5px] font-semibold text-pen-foreground"
        >
          {label}
        </label>
        {description ? (
          <p className="font-sans text-[11.5px] text-pen-subtle">{description}</p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="h-[22px] w-[38px] shrink-0 data-checked:bg-pen-blue data-unchecked:bg-[#d1d5db] dark:data-unchecked:bg-pen-card-border [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:data-checked:translate-x-[calc(100%-2px)] [&_[data-slot=switch-thumb]]:data-unchecked:translate-x-0.5"
      />
    </div>
  );
}

function NotificationCard({
  title,
  rows,
  preferences,
  onPreferenceChange,
}: {
  title: string;
  rows: NotificationRow[];
  preferences: Record<string, boolean>;
  onPreferenceChange: (id: string, checked: boolean) => void;
}) {
  return (
    <section
      className={cn(
        "w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card",
        "px-[22px] pt-4 pb-2",
      )}
    >
      <h2 className="pb-1.5 font-sans text-sm font-semibold text-pen-foreground">
        {title}
      </h2>
      <div className="flex flex-col">
        {rows.map((row) => (
          <NotificationToggle
            key={row.id}
            id={row.id}
            label={row.label}
            description={row.description}
            checked={preferences[row.id] ?? row.defaultOn}
            onCheckedChange={(checked) => onPreferenceChange(row.id, checked)}
          />
        ))}
      </div>
    </section>
  );
}

export function SettingsNotificationsPage({
  initialPreferences,
}: {
  initialPreferences?: Record<string, boolean>;
}) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>(
    () => {
      const merged = { ...DEFAULT_PREFERENCES };
      for (const key of Object.keys(merged)) {
        const value = initialPreferences?.[key];
        if (typeof value === "boolean") merged[key] = value;
      }
      return merged;
    },
  );

  function handlePreferenceChange(id: string, checked: boolean) {
    const next = { ...preferences, [id]: checked };
    setPreferences(next);
    void updateNotificationPrefs({ notificationPrefs: next } as never).catch(() =>
      toast.error("Failed to save notification preferences"),
    );
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="pen-text-admin-title">
          Notifications
        </h1>
        <p className="font-sans text-[13px] text-pen-muted">
          Choose what reaches you and how.
        </p>
      </header>

      {NOTIFICATION_SECTIONS.map((section) => (
        <NotificationCard
          key={section.title}
          title={section.title}
          rows={section.rows}
          preferences={preferences}
          onPreferenceChange={handlePreferenceChange}
        />
      ))}
    </div>
  );
}
