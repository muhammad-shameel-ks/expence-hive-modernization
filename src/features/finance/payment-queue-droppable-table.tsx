"use client";
// Drag-and-drop table container for the finance payment queue (ADR-0023).
// Accepts Excel payment register spreadsheets (.xlsx) dropped directly onto
// the table, displays an animated visual indicator during dragover, and shows
// a processing state while the server parses and selects matching claims.

import React, { useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaymentQueueDroppableTableProps {
  /** Callback fired when a file is dropped onto the table surface. */
  onFileDrop: (file: File) => void;
  /** Whether the dropped register is currently being imported/parsed by the server. */
  isImporting?: boolean;
  /** Keyboard navigation handler for the scrollable table viewport. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Accessible label describing keyboard navigation and drop capabilities. */
  ariaLabel?: string;
  tabIndex?: number;
  className?: string;
  children: React.ReactNode;
}

export function PaymentQueueDroppableTable({
  onFileDrop,
  isImporting = false,
  onKeyDown,
  ariaLabel = "Payment queue, arrow keys move selection, Enter opens claim details",
  tabIndex = 0,
  className,
  children,
}: PaymentQueueDroppableTableProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    if (event.dataTransfer?.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      onFileDrop(file);
    }
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-dropeffect="copy"
      data-testid="payment-queue-droppable-table"
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative max-h-[70vh] overflow-auto rounded-xl border transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        isDragging
          ? "border-2 border-dashed border-primary bg-primary/[0.03] ring-4 ring-primary/10 shadow-lg"
          : "border-black/10 hover:border-black/20",
        className,
      )}
    >
      {isDragging ? (
        <div
          data-testid="drag-overlay"
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/90 p-6 text-center backdrop-blur-sm transition-all animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="relative mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-sm">
            <FileSpreadsheet className="h-8 w-8" aria-hidden="true" />
            <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <UploadCloud className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
            </div>
          </div>

          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Drop Excel register to auto-select claims
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Release the payment register spreadsheet (.xlsx) here to match and select claims in the table
          </p>

          <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary shadow-xs">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            Accepts .xlsx payment registers
          </span>
        </div>
      ) : null}

      {isImporting ? (
        <div
          data-testid="importing-overlay"
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/85 p-6 text-center backdrop-blur-xs transition-all animate-in fade-in duration-200"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
            <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            Parsing payment register…
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Matching claims and updating table selection
          </p>
        </div>
      ) : null}

      {children}
    </div>
  );
}
