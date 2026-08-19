"use client";

import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { LONDON_TZ } from "@/lib/london-time";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const tzFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  timeZoneName: "short",
});

function formatTimeParts(now: Date) {
  const parts = timeFormatter.formatToParts(now);
  return {
    hours: parts.find((p) => p.type === "hour")?.value ?? "00",
    minutes: parts.find((p) => p.type === "minute")?.value ?? "00",
    seconds: parts.find((p) => p.type === "second")?.value ?? "00",
  };
}

function getTzAbbr(now: Date) {
  return tzFormatter.formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
}

function LondonClockInner({ className, compact }: { className?: string; compact?: boolean }) {
  const hoursRef = useRef<HTMLSpanElement>(null);
  const minutesRef = useRef<HTMLSpanElement>(null);
  const secondsRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLParagraphElement>(null);
  const tzRef = useRef<HTMLSpanElement>(null);
  const colon1Ref = useRef<HTMLSpanElement>(null);
  const colon2Ref = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blinkRef = useRef(true);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const parts = formatTimeParts(now);

      if (hoursRef.current) hoursRef.current.textContent = parts.hours;
      if (minutesRef.current) minutesRef.current.textContent = parts.minutes;
      if (secondsRef.current) secondsRef.current.textContent = parts.seconds;
      if (dateRef.current) dateRef.current.textContent = dateFormatter.format(now);
      if (tzRef.current) tzRef.current.textContent = getTzAbbr(now);

      blinkRef.current = !blinkRef.current;
      const opacity = blinkRef.current ? "1" : "0.25";
      if (colon1Ref.current) colon1Ref.current.style.opacity = opacity;
      if (colon2Ref.current) colon2Ref.current.style.opacity = opacity;

      containerRef.current?.setAttribute(
        "aria-label",
        `London local time ${parts.hours}:${parts.minutes}:${parts.seconds}`,
      );
    };

    update();
    const tick = setInterval(update, 1000);
    return () => clearInterval(tick);
  }, []);

  if (compact) {
    return (
      <div className={cn("flex flex-col select-none", className)}>
        <p className="pen-text-section-label">
          London
          <span ref={tzRef} className="ml-1 font-semibold text-pen-blue" />
        </p>
        <div
          ref={containerRef}
          className="mt-0.5 flex items-baseline font-mono font-bold leading-none tracking-[-0.03em] text-pen-foreground"
          style={{ fontSize: "2.4rem" }}
          aria-live="polite"
          aria-label="London local time loading"
          suppressHydrationWarning
        >
          <span ref={hoursRef} className="tabular-nums">--</span>
          <span ref={colon1Ref} className="text-pen-blue transition-opacity duration-150">:</span>
          <span ref={minutesRef} className="tabular-nums">--</span>
          <span ref={colon2Ref} className="text-pen-blue transition-opacity duration-150">:</span>
          <span ref={secondsRef} className="tabular-nums text-pen-muted" style={{ fontSize: "0.7em" }}>--</span>
        </div>
        <p
          ref={dateRef}
          className="mt-0.5 font-sans text-[11.5px] text-pen-muted"
          suppressHydrationWarning
        >
          {"\u00a0"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center text-center select-none", className)}>
      <p className="font-sans text-[13px] font-semibold tracking-wide text-pen-foreground">
        London Local Time
        <span ref={tzRef} className="ml-1.5 font-semibold text-pen-blue" />
      </p>

      <div
        ref={containerRef}
        className="mt-0.5 flex items-baseline font-mono font-bold leading-none tracking-[-0.04em] text-pen-foreground"
        style={{ fontSize: "clamp(2.75rem, 5vw, 3.75rem)" }}
        aria-live="polite"
        aria-label="London local time loading"
        suppressHydrationWarning
      >
        <span ref={hoursRef} className="tabular-nums">
          --
        </span>
        <span
          ref={colon1Ref}
          className="text-pen-blue transition-opacity duration-150"
        >
          :
        </span>
        <span ref={minutesRef} className="tabular-nums">
          --
        </span>
        <span
          ref={colon2Ref}
          className="text-pen-blue transition-opacity duration-150"
        >
          :
        </span>
        <span
          ref={secondsRef}
          className="tabular-nums font-semibold text-pen-muted"
          style={{ fontSize: "0.68em" }}
        >
          --
        </span>
      </div>

      <p
        ref={dateRef}
        className="mt-0.5 font-sans text-[12.5px] text-pen-muted"
        suppressHydrationWarning
      >
        {"\u00a0"}
      </p>
    </div>
  );
}

export const LondonClock = memo(LondonClockInner) as typeof LondonClockInner;

// ── DualClock — BD + UK side by side ─────────────────────────────────────────

const BD_TZ = "Asia/Dhaka";

function makeTzFormatters(tz: string) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
  const tzName = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" });
  return { time, date, tzName };
}

function getTimeParts(fmt: Intl.DateTimeFormat, now: Date) {
  const p = fmt.formatToParts(now);
  return {
    h: p.find((x) => x.type === "hour")?.value ?? "--",
    m: p.find((x) => x.type === "minute")?.value ?? "--",
    s: p.find((x) => x.type === "second")?.value ?? "--",
  };
}

function getTzAbbrFrom(fmt: Intl.DateTimeFormat, now: Date) {
  return fmt.formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
}

function FlagBangladesh({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 12"
      className={cn("h-3.5 w-auto shrink-0", className)}
      aria-hidden
    >
      <rect width="20" height="12" fill="#006A4E" />
      <circle cx="8.5" cy="6" r="3.5" fill="#F42A41" />
    </svg>
  );
}

function FlagUk({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 30"
      className={cn("h-3.5 w-auto shrink-0", className)}
      aria-hidden
    >
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function ClockFace({
  flag,
  ariaLabel,
  color,
  hoursRef,
  minutesRef,
  secondsRef,
  dateRef,
  tzRef,
  colon1Ref,
  colon2Ref,
}: {
  flag: React.ReactNode;
  ariaLabel: string;
  color: string;
  hoursRef: React.RefObject<HTMLSpanElement | null>;
  minutesRef: React.RefObject<HTMLSpanElement | null>;
  secondsRef: React.RefObject<HTMLSpanElement | null>;
  dateRef: React.RefObject<HTMLParagraphElement | null>;
  tzRef: React.RefObject<HTMLSpanElement | null>;
  colon1Ref: React.RefObject<HTMLSpanElement | null>;
  colon2Ref: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="flex flex-col items-end select-none">
      <p className="pen-text-section-label flex items-center gap-1.5" aria-label={`${ariaLabel} time`}>
        {flag}
        <span ref={tzRef} className="font-semibold normal-case tracking-normal" style={{ color }} />
      </p>
      <div
        className="mt-0.5 flex items-baseline font-mono font-bold leading-none tracking-[-0.03em] text-pen-foreground"
        style={{ fontSize: "2.2rem" }}
        suppressHydrationWarning
      >
        <span ref={hoursRef} className="tabular-nums">--</span>
        <span ref={colon1Ref} className="transition-opacity duration-150" style={{ color }}>:</span>
        <span ref={minutesRef} className="tabular-nums">--</span>
        <span ref={colon2Ref} className="transition-opacity duration-150" style={{ color }}>:</span>
        <span ref={secondsRef} className="tabular-nums text-pen-muted" style={{ fontSize: "0.65em" }}>--</span>
      </div>
      <p ref={dateRef} className="mt-0.5 font-sans text-[11.5px] text-pen-muted" suppressHydrationWarning>
        {" "}
      </p>
    </div>
  );
}

function DualClockInner({
  className,
  compact,
  hideBangladesh,
}: {
  className?: string;
  compact?: boolean;
  hideBangladesh?: boolean;
}) {
  const bdHours = useRef<HTMLSpanElement>(null);
  const bdMinutes = useRef<HTMLSpanElement>(null);
  const bdSeconds = useRef<HTMLSpanElement>(null);
  const bdDate = useRef<HTMLParagraphElement>(null);
  const bdTz = useRef<HTMLSpanElement>(null);
  const bdColon1 = useRef<HTMLSpanElement>(null);
  const bdColon2 = useRef<HTMLSpanElement>(null);

  const ukHours = useRef<HTMLSpanElement>(null);
  const ukMinutes = useRef<HTMLSpanElement>(null);
  const ukSeconds = useRef<HTMLSpanElement>(null);
  const ukDate = useRef<HTMLParagraphElement>(null);
  const ukTz = useRef<HTMLSpanElement>(null);
  const ukColon1 = useRef<HTMLSpanElement>(null);
  const ukColon2 = useRef<HTMLSpanElement>(null);

  const blinkRef = useRef(true);

  useEffect(() => {
    const { time: bdTime, date: bdDateFmt, tzName: bdTzFmt } = makeTzFormatters(BD_TZ);
    const { time: ukTime, date: ukDateFmt, tzName: ukTzFmt } = makeTzFormatters(LONDON_TZ);

    const update = () => {
      const now = new Date();
      const bd = getTimeParts(bdTime, now);
      const uk = getTimeParts(ukTime, now);

      if (bdHours.current) bdHours.current.textContent = bd.h;
      if (bdMinutes.current) bdMinutes.current.textContent = bd.m;
      if (bdSeconds.current) bdSeconds.current.textContent = bd.s;
      if (bdDate.current) bdDate.current.textContent = bdDateFmt.format(now);
      if (bdTz.current) bdTz.current.textContent = getTzAbbrFrom(bdTzFmt, now);

      if (ukHours.current) ukHours.current.textContent = uk.h;
      if (ukMinutes.current) ukMinutes.current.textContent = uk.m;
      if (ukSeconds.current) ukSeconds.current.textContent = uk.s;
      if (ukDate.current) ukDate.current.textContent = ukDateFmt.format(now);
      if (ukTz.current) ukTz.current.textContent = getTzAbbrFrom(ukTzFmt, now);

      blinkRef.current = !blinkRef.current;
      const opacity = blinkRef.current ? "1" : "0.25";
      [bdColon1, bdColon2, ukColon1, ukColon2].forEach((r) => {
        if (r.current) r.current.style.opacity = opacity;
      });
    };

    update();
    const tick = setInterval(update, 1000);
    return () => clearInterval(tick);
  }, []);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3 font-mono text-[13px] text-pen-muted select-none", className)} suppressHydrationWarning>
        {!hideBangladesh && (
          <>
            <span className="flex items-center gap-1.5">
              <FlagBangladesh className="h-3" />
              <span ref={bdHours} className="font-semibold tabular-nums text-pen-foreground">--</span>
              <span ref={bdColon1} className="-mx-1 transition-opacity duration-150" style={{ color: "#f97316" }}>:</span>
              <span ref={bdMinutes} className="font-semibold tabular-nums text-pen-foreground">--</span>
            </span>
            <span className="h-3.5 w-px bg-pen-card-border" />
          </>
        )}
        <span className="flex items-center gap-1.5">
          <FlagUk className="h-3" />
          <span ref={ukHours} className="font-semibold tabular-nums text-pen-foreground">--</span>
          <span ref={ukColon1} className="-mx-1 transition-opacity duration-150" style={{ color: "#0a76b9" }}>:</span>
          <span ref={ukMinutes} className="font-semibold tabular-nums text-pen-foreground">--</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-4", className)}>
      {!hideBangladesh && (
        <>
          <ClockFace
            flag={<FlagBangladesh />}
            ariaLabel="Bangladesh"
            color="#f97316"
            hoursRef={bdHours}
            minutesRef={bdMinutes}
            secondsRef={bdSeconds}
            dateRef={bdDate}
            tzRef={bdTz}
            colon1Ref={bdColon1}
            colon2Ref={bdColon2}
          />
          <div className="mt-1 self-stretch w-px bg-pen-card-border" />
        </>
      )}
      <ClockFace
        flag={<FlagUk />}
        ariaLabel="United Kingdom"
        color="#0a76b9"
        hoursRef={ukHours}
        minutesRef={ukMinutes}
        secondsRef={ukSeconds}
        dateRef={ukDate}
        tzRef={ukTz}
        colon1Ref={ukColon1}
        colon2Ref={ukColon2}
      />
    </div>
  );
}

export const DualClock = memo(DualClockInner) as typeof DualClockInner;
