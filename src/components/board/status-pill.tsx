import { cn } from "@/lib/utils";
import { statusStyle } from "@/components/board/board-types";

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type StatusPillProps = {
  status: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function StatusPill({
  status,
  color,
  size = "sm",
  className,
}: StatusPillProps) {
  const style = statusStyle(status);

  const sizeClass =
    size === "lg"
      ? "gap-1.5 px-3 py-1 text-[13px]"
      : size === "md"
        ? "px-[9px] py-0.5 text-[11.5px]"
        : "px-2 py-0.5 text-[11.5px]";

  const dotClass =
    size === "lg" ? "size-2" : size === "md" ? "size-[7px]" : "size-[5px]";

  if (color) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-[5px] rounded-full border font-sans font-medium whitespace-nowrap",
          "text-pen-foreground ring-1 ring-inset ring-black/4 dark:ring-white/10",
          sizeClass,
          className,
        )}
        style={{
          backgroundColor: hexToRgba(color, 0.2),
          borderColor: hexToRgba(color, 0.38),
        }}
      >
        <span
          className={cn("block shrink-0 rounded-full", dotClass)}
          style={{ backgroundColor: color }}
        />
        {status}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-[5px] rounded-full font-sans font-medium whitespace-nowrap",
        "ring-1 ring-inset ring-black/4 dark:ring-white/10",
        style.pillBg,
        style.pillText,
        size === "lg" && "px-3 py-1 text-[13px] font-semibold",
        size === "md" && "px-[9px] py-0.5 text-[11.5px]",
        size === "sm" && "px-2 py-0.5 text-[11.5px]",
        className,
      )}
    >
      <span
        className={cn("block shrink-0 rounded-full", style.dot, dotClass)}
      />
      {status}
    </span>
  );
}

type StatusFilterButtonProps = {
  status: string;
  color?: string;
  count: number;
  active: boolean;
  onClick: () => void;
};

export function StatusFilterButton({
  status,
  color,
  count,
  active,
  onClick,
}: StatusFilterButtonProps) {
  const style = statusStyle(status);

  if (color) {
    const bg = active ? hexToRgba(color, 0.16) : hexToRgba(color, 0.07);
    const border = active ? hexToRgba(color, 0.4) : hexToRgba(color, 0.12);
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1 transition-colors",
          !active && "hover:opacity-90",
        )}
        style={{ backgroundColor: bg, borderColor: border }}
      >
        <span
          className="font-sans text-[11.5px] font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {count}
        </span>
        <span
          className="flex items-center gap-1 font-sans text-[11.5px] font-medium leading-none whitespace-nowrap"
          style={{ color }}
        >
          <span className="block size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          {status}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1 transition-colors",
        !active && "hover:opacity-90",
        active
          ? cn(style.filterActiveBg, style.filterActiveBorder, style.filterActiveText)
          : cn(style.filterBg, style.filterText, "border-transparent"),
      )}
    >
      <span className={cn("font-sans text-[11.5px] font-bold leading-none tabular-nums", style.filterCount)}>
        {count}
      </span>
      <span className={cn("flex items-center gap-1 font-sans text-[11.5px] font-medium leading-none whitespace-nowrap", active ? style.filterActiveText : style.filterText)}>
        <span className={cn("block size-1.5 shrink-0 rounded-full", style.dot)} />
        {status}
      </span>
    </button>
  );
}
