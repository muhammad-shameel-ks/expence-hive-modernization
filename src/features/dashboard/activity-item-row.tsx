"use client";

import { ChevronRight, Clock, User } from "lucide-react";
import { ACTION_INDICATOR_STYLES, KIND_META, formatMoney } from "./journey-meta";
import type { ActivityItem } from "./mock-data";
import { cn } from "@/lib/utils";

export interface ActivityItemRowProps {
  item: ActivityItem;
  onClick?: () => void;
  isLoading?: boolean;
  showActor?: boolean;
}

export function ActivityItemRow({
  item,
  onClick,
  isLoading = false,
  showActor = true,
}: ActivityItemRowProps) {
  const meta = KIND_META[item.kind];
  const style = ACTION_INDICATOR_STYLES[item.kind] ?? {
    label: meta.label,
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBgClass: "bg-muted",
    iconColorClass: "text-muted-foreground",
    borderClass: "border-border",
  };
  const Icon = meta.icon;

  const Component = onClick ? "button" : "div";
  const interactiveProps = onClick
    ? {
        type: "button" as const,
        onClick,
        disabled: isLoading,
      }
    : {};

  return (
    <Component
      {...interactiveProps}
      className={cn(
        "group relative flex w-full items-start gap-3.5 rounded-xl border border-transparent p-3 text-left transition-all duration-150",
        onClick && "hover:border-border/60 hover:bg-muted/50 hover:shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none",
      )}
    >
      {/* Action Icon Badge with Color Indicator */}
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-medium shadow-2xs transition-transform duration-200 group-hover:scale-105",
          style.iconBgClass,
          style.iconColorClass,
          style.borderClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Main Item Content */}
      <div className="min-w-0 flex-1">
        {/* Top Row: Actor / Action Badge / Title & Timestamp */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {showActor && item.actorName ? (
              <span className="truncate text-sm font-semibold text-foreground">
                {item.actorName}
              </span>
            ) : null}

            {/* Colored Action Indicator Badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border shadow-2xs transition-colors",
                style.badgeClass,
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span>{style.label}</span>
            </span>

            <span className="text-muted-foreground/60 font-normal" aria-hidden="true">
              &middot;
            </span>

            <span className="truncate text-sm font-medium text-foreground tracking-tight">
              {item.claimTitle}
            </span>
          </div>

          {/* Time Badge */}
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
            <Clock className="h-3 w-3 text-muted-foreground/60" />
            {isLoading ? "Opening…" : item.date}
          </span>
        </div>

        {/* Metadata Row: Claim Ref, Requester, Amount */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground/80 border border-border/50">
            {item.claimRef}
          </span>

          {item.claimCategory ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden="true">
                &middot;
              </span>
              <span className="rounded-md bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {item.claimCategory}
              </span>
            </>
          ) : null}

          {showActor ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden="true">
                &middot;
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground/60" />
                Raised by <strong className="font-medium text-foreground/90">{item.requesterName}</strong>
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground/40" aria-hidden="true">
                &middot;
              </span>
              <span>{item.requesterName}</span>
            </>
          )}

          <span className="text-muted-foreground/40" aria-hidden="true">
            &middot;
          </span>
          <span className="font-semibold text-foreground text-xs tabular-nums">
            {formatMoney(item.amount, item.currency)}
          </span>
        </div>

        {/* Detail Callout / Note */}
        {item.detail ? (
          <div
            className={cn(
              "mt-2 rounded-lg border px-3 py-2 text-xs transition-colors leading-relaxed",
              style.calloutBgClass ?? "bg-muted/40 border-border/60 text-muted-foreground",
            )}
          >
            {item.detail}
          </div>
        ) : null}
      </div>

      {/* Right Edge Chevron Indicator for Clickable Items */}
      {onClick ? (
        <div className="flex h-9 items-center justify-center pl-1">
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground shrink-0" />
        </div>
      ) : null}
    </Component>
  );
}
