"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ListFilter, RotateCcw, ScrollText } from "lucide-react";
import type { AdminEmployee, AuditEvent } from "@/server/admin/ports";
import { SectionHeading } from "./section-heading";
import { AUDIT_ACTION_OPTIONS, actionLabel, actorName, formatTimestamp } from "./audit-labels";

const PAGE_SIZE = 50;

// The endpoint serializes created_at as an ISO string; keep that shape local
// so the component does not pretend to hold Date objects.
type AuditEventRow = Omit<AuditEvent, "createdAt"> & { createdAt: string };

type AuditPage = {
  events: AuditEventRow[];
  total: number;
};

const FILTER_CONTROL_CLASS =
  "h-10 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]";

export function AuditSection({
  people,
  onError,
}: {
  people: AdminEmployee[];
  onError: (message: string) => void;
}) {
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (actorFilter !== "all") params.set("actorId", actorFilter);
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));

    const controller = new AbortController();
    fetch(`/api/admin/audit?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed with status ${response.status}.`);
        }
        return response.json() as Promise<AuditPage>;
      })
      .then((next) => {
        setData(next);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoading(false);
        onError("The audit log could not be loaded. Please try again.");
      });
    return () => controller.abort();
  }, [actionFilter, actorFilter, fromDate, onError, page, refreshKey, toDate]);

  const beginFetch = () => {
    setLoading(true);
    onError("");
    setRefreshKey((current) => current + 1);
  };

  const changeActor = (value: string) => {
    setActorFilter(value);
    setPage(1);
    beginFetch();
  };
  const changeAction = (value: string) => {
    setActionFilter(value);
    setPage(1);
    beginFetch();
  };
  const changeFrom = (value: string) => {
    setFromDate(value);
    setPage(1);
    beginFetch();
  };
  const changeTo = (value: string) => {
    setToDate(value);
    setPage(1);
    beginFetch();
  };
  const resetFilters = () => {
    setActorFilter("all");
    setActionFilter("all");
    setFromDate("");
    setToDate("");
    setPage(1);
    beginFetch();
  };
  const goToPreviousPage = () => {
    setPage((current) => current - 1);
    beginFetch();
  };
  const goToNextPage = () => {
    setPage((current) => current + 1);
    beginFetch();
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;
  const events = data?.events ?? [];

  return (
    <section id="audit" className="mt-8" aria-labelledby="audit-title">
      <SectionHeading
        number="3"
        icon={ScrollText}
        title="Audit log"
        description="Review the chronological trail of administrative changes: who did what, when, and to which target."
      />

      <div className="mt-5 rounded-[18px] border border-[#e0e7ee] bg-white shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#eef2f6] p-5">
          <ListFilter className="hidden size-4 text-[#9aa6b5] sm:block" />
          <label className="sr-only" htmlFor="audit-actor">Filter by actor</label>
          <select
            id="audit-actor"
            className={FILTER_CONTROL_CLASS}
            value={actorFilter}
            onChange={(event) => changeActor(event.target.value)}
          >
            <option value="all">All actors</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="audit-action">Filter by action</label>
          <select
            id="audit-action"
            className={FILTER_CONTROL_CLASS}
            value={actionFilter}
            onChange={(event) => changeAction(event.target.value)}
          >
            <option value="all">All actions</option>
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <option key={option.action} value={option.action}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="audit-from">From date</label>
          <input
            id="audit-from"
            type="date"
            className={FILTER_CONTROL_CLASS}
            value={fromDate}
            onChange={(event) => changeFrom(event.target.value)}
          />

          <label className="sr-only" htmlFor="audit-to">To date</label>
          <input
            id="audit-to"
            type="date"
            className={FILTER_CONTROL_CLASS}
            value={toDate}
            onChange={(event) => changeTo(event.target.value)}
          />

          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg border border-[#d6dfe8] bg-white px-3 py-2 text-xs font-semibold text-[#526278] transition-colors hover:bg-[#f4f7fa] hover:text-[#26364b] focus-visible:outline-2 focus-visible:outline-[#8ab5c6]"
          >
            <RotateCcw className="size-3.5" />
            Reset filters
          </button>
        </div>

        {/* Loading / Empty / Table */}
        {loading && data === null ? (
          <p className="p-8 text-center text-sm text-[#7d8a9b]" role="status">
            Loading audit events...
          </p>
        ) : events.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#7d8a9b]">
            No audit events match these filters.
          </p>
        ) : (
          <>
            {loading ? (
              <p className="border-b border-[#eef2f6] px-5 py-2 text-xs text-[#7d8a9b]" role="status">
                Loading audit events...
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-[#eef2f6] bg-[#fbfcfd] text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#8a96a8]">
                    <th scope="col" className="px-5 py-3">Timestamp</th>
                    <th scope="col" className="px-5 py-3">Actor</th>
                    <th scope="col" className="px-5 py-3">Action</th>
                    <th scope="col" className="px-5 py-3">Target / Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-[#eef2f6] last:border-0">
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[#526278]">
                        {formatTimestamp(event.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-semibold text-[#33445c]">
                        {actorName(people, event.actorId)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className="rounded-full bg-[#eaf3f6] px-2 py-0.5 text-[0.62rem] font-bold text-[#196d86]">
                          {actionLabel(event.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#526278]">{event.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f6] px-5 py-4">
          <p className="text-xs text-[#9aa6b5]">
            {total.toLocaleString()} events · {PAGE_SIZE} per page
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canGoPrevious}
              onClick={goToPreviousPage}
              className="flex items-center gap-1 rounded-lg border border-[#d6dfe8] bg-white px-3 py-1.5 text-xs font-semibold text-[#526278] transition-colors hover:bg-[#f4f7fa] hover:text-[#26364b] focus-visible:outline-2 focus-visible:outline-[#8ab5c6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </button>
            <span className="text-xs font-semibold text-[#526278]" role="status">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={goToNextPage}
              className="flex items-center gap-1 rounded-lg border border-[#d6dfe8] bg-white px-3 py-1.5 text-xs font-semibold text-[#526278] transition-colors hover:bg-[#f4f7fa] hover:text-[#26364b] focus-visible:outline-2 focus-visible:outline-[#8ab5c6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
