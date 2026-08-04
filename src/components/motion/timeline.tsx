// Reusable timeline, modelled on the MUI Timeline API
// (Timeline / TimelineItem / TimelineSeparator / TimelineDot /
// TimelineConnector / TimelineContent / TimelineOppositeContent).
// Server-safe: no hooks, no motion — compose with motion/status components at call sites.

import {
  createContext,
  useContext,
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type TimelinePosition = "right" | "left" | "alternate";
export type TimelineOrientation = "vertical" | "horizontal";
export type TimelineTone =
  | "default"
  | "muted"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger";

/**
 * position="right" — timeline line on the left edge, content on the right (MUI default).
 * position="left" — timeline line on the right edge, content on the left.
 * position="alternate" — content alternates sides; use TimelineOppositeContent for the other side.
 */
export interface TimelineProps {
  position?: TimelinePosition;
  orientation?: TimelineOrientation;
  className?: string;
  children: ReactNode;
}

interface TimelineItemContextValue {
  position: TimelinePosition;
  orientation: TimelineOrientation;
  first: boolean;
  last: boolean;
  even: boolean;
}

const TimelineItemContext = createContext<TimelineItemContextValue | null>(null);

export function Timeline({
  position = "right",
  orientation = "vertical",
  className,
  children,
}: TimelineProps) {
  const count = Children.count(children);
  const items = Children.map(children, (child, index) => {
    if (!isValidElement<TimelineItemProps>(child)) return child;
    return cloneElement<TimelineItemProps>(child, {
      position,
      orientation,
      first: index === 0,
      last: index === count - 1,
      even: index % 2 === 0,
    });
  });
  return (
    <ol
      className={cn(
        orientation === "vertical" ? "flex flex-col" : "flex w-full items-stretch",
        className,
      )}
    >
      {items}
    </ol>
  );
}

export interface TimelineItemProps {
  position?: TimelinePosition;
  orientation?: TimelineOrientation;
  first?: boolean;
  last?: boolean;
  even?: boolean;
  className?: string;
  children?: ReactNode;
}

export function TimelineItem({
  position = "right",
  orientation = "vertical",
  first = false,
  last = false,
  even = true,
  className,
  children,
}: TimelineItemProps) {
  const value: TimelineItemContextValue = { position, orientation, first, last, even };
  return (
    <li
      className={cn(
        orientation === "vertical" &&
          position === "alternate" &&
          "grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]",
        orientation === "vertical" && position === "right" && "grid grid-cols-[3rem_minmax(0,1fr)]",
        orientation === "vertical" && position === "left" && "grid grid-cols-[minmax(0,1fr)_3rem]",
        orientation === "horizontal" &&
          "grid min-w-36 flex-1 grid-rows-[auto_auto_auto] justify-items-center",
        className,
      )}
    >
      <TimelineItemContext.Provider value={value}>{children}</TimelineItemContext.Provider>
    </li>
  );
}

function useTimelineItem() {
  const ctx = useContext(TimelineItemContext);
  if (!ctx) throw new Error("Timeline sub-components must be used inside <TimelineItem>");
  return ctx;
}

/** The connector between dots. Rendered automatically by TimelineSeparator. */
export function TimelineConnector({
  orientation = "vertical",
  className,
}: {
  orientation?: TimelineOrientation;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        orientation === "vertical" ? "w-0.5 flex-1" : "h-0.5 flex-1",
        "bg-border",
        className,
      )}
    />
  );
}

/**
 * The dot column (or horizontal line) between the two content sides.
 * Connectors are drawn around the children automatically and fade out on
 * the first and last item of the timeline.
 */
export function TimelineSeparator({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { orientation, position, first, last } = useTimelineItem();
  const vertical = orientation === "vertical";

  const colStart = !vertical
    ? "row-start-2"
    : position === "alternate" || position === "right"
      ? "row-start-1 col-start-2"
      : "row-start-1 col-start-1";

  return (
    <div
      className={cn(
        colStart,
        vertical
          ? "flex h-full flex-col items-center justify-center"
          : "flex w-full items-center justify-center",
        className,
      )}
    >
      {vertical ? (
        <>
          <span aria-hidden className={cn("h-1 w-0.5 shrink-0", first ? "bg-transparent" : "bg-border")} />
          <span className="relative z-10 inline-flex shrink-0">{children}</span>
          <span aria-hidden className={cn("min-h-0 w-0.5 flex-1", last ? "bg-transparent" : "bg-border")} />
        </>
      ) : (
        <>
          <span aria-hidden className={cn("h-0.5 flex-1", first ? "bg-transparent" : "bg-border")} />
          {children}
          <span aria-hidden className={cn("h-0.5 flex-1", last ? "bg-transparent" : "bg-border")} />
        </>
      )}
    </div>
  );
}

const DOT_SIZES = {
  sm: "h-3 w-3 text-[8px]",
  md: "h-4 w-4 text-[10px]",
  lg: "h-6 w-6 text-sm",
} as const;

const DOT_TONES_FILLED: Record<TimelineTone, string> = {
  default: "border border-border bg-card text-muted-foreground",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary text-primary-foreground",
  info: "bg-sky-500 text-white",
  success: "bg-emerald-500 text-white",
  warning: "bg-amber-500 text-white",
  danger: "bg-red-500 text-white",
};

const DOT_TONES_OUTLINED: Record<TimelineTone, string> = {
  default: "border border-border bg-card text-muted-foreground",
  muted: "border border-muted-foreground/40 bg-card text-muted-foreground",
  primary: "border border-primary bg-card text-primary",
  info: "border border-sky-500 bg-card text-sky-600",
  success: "border border-emerald-500 bg-card text-emerald-600",
  warning: "border border-amber-500 bg-card text-amber-600",
  danger: "border border-red-500 bg-card text-red-600",
};

export interface TimelineDotProps {
  tone?: TimelineTone;
  variant?: "filled" | "outlined";
  size?: keyof typeof DOT_SIZES;
  /** Marks the current stage of a live journey with a pulse ring. */
  current?: boolean;
  /** Icon or other content rendered inside the dot. */
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function TimelineDot({
  tone = "default",
  variant = "filled",
  size = "md",
  current = false,
  icon,
  children,
  className,
}: TimelineDotProps) {
  const content = icon ?? children;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        DOT_SIZES[size],
        variant === "filled" ? DOT_TONES_FILLED[tone] : DOT_TONES_OUTLINED[tone],
        current && "ring-4 ring-primary/10",
        className,
      )}
    >
      {current ? (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-current opacity-30 motion-reduce:animate-none"
        />
      ) : null}
      {content ? (
        <span className={cn("inline-flex", size === "lg" ? "[&>svg]:h-3.5 [&>svg]:w-3.5" : "[&>svg]:h-2.5 [&>svg]:w-2.5")}>
          {content}
        </span>
      ) : null}
    </span>
  );
}

/** Primary content block for an item. */
export function TimelineContent({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { orientation, position, even } = useTimelineItem();
  const vertical = orientation === "vertical";
  const side =
    vertical && position === "alternate"
      ? even
        ? "row-start-1 col-start-3 text-left"
        : "row-start-1 col-start-1 text-right"
      : vertical && position === "right"
        ? "row-start-1 col-start-2 text-left"
        : vertical
          ? "row-start-1 col-start-1 text-right"
          : "row-start-1 text-center";

  return <div className={cn(vertical ? "px-3 py-1" : "px-1 pt-1", side, className)}>{children}</div>;
}

/** Secondary content block on the opposite side (alternate position). */
export function TimelineOppositeContent({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { orientation, position, even } = useTimelineItem();
  const vertical = orientation === "vertical";

  if (vertical && position !== "alternate") return null;

  const side = vertical
    ? even
      ? "row-start-1 col-start-1 text-right"
      : "row-start-1 col-start-3 text-left"
    : "row-start-3 text-center";

  return <div className={cn(vertical ? "px-3 py-1" : "px-1 pb-1", side, className)}>{children}</div>;
}
