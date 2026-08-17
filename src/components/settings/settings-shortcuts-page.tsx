import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

type Shortcut = {
  label: string;
  keys: string[];
};

type ShortcutSection = {
  title: string;
  shortcuts: Shortcut[];
};

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "General",
    shortcuts: [
      { label: "Open command palette", keys: ["⌘", "K"] },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { label: "Create task", keys: ["X", "Space"] },
    ],
  },
];

function ShortcutRow({ label, keys }: Shortcut) {
  return (
    <div className="flex items-center gap-4 border-t border-pen-surface py-2.5">
      <span className="min-w-0 font-sans text-[12.5px] text-pen-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1" aria-hidden />
      <KbdGroup>
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </KbdGroup>
    </div>
  );
}

function ShortcutCard({ title, shortcuts }: ShortcutSection) {
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
        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.label} {...shortcut} />
        ))}
      </div>
    </section>
  );
}

export function SettingsShortcutsPage() {
  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="pen-text-admin-title">
          Keyboard shortcuts
        </h1>
        <p className="font-sans text-[13px] text-pen-muted">
          Move faster without the mouse.
        </p>
      </header>

      {SHORTCUT_SECTIONS.map((section) => (
        <ShortcutCard key={section.title} {...section} />
      ))}
    </div>
  );
}
