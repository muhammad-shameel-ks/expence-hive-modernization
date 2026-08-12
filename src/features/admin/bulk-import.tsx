"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminEmployee } from "@/server/admin/ports";

type ImportRowResult = {
  rowNumber: number;
  email: string;
  status: "created" | "failed";
  error?: string;
  employee?: AdminEmployee;
};

type ImportOutcome =
  | { kind: "idle" }
  | { kind: "success"; created: ImportRowResult[] }
  | { kind: "failed"; failed: ImportRowResult[] };

const ROSTER_TEMPLATE = "name,email,role,department,manager\nGrace Hopper,grace@hive.local,executive,Engineering,";

// Bulk roster import (ADR-0019): the file is parsed and validated server
// side with per-row errors; a single bad row means nothing is written.
export function BulkImport({
  onImported,
  onMessage,
  onError,
}: {
  onImported: (employees: AdminEmployee[]) => void;
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome>({ kind: "idle" });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setOutcome({ kind: "idle" });
    setCsv(await file.text());
  };

  const runImport = async () => {
    if (!csv.trim()) return;
    setImporting(true);
    onError("");
    setOutcome({ kind: "idle" });
    try {
      const response = await fetch("/api/admin/employees/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = (await response.json()) as {
        error?: string;
        result?: { created: ImportRowResult[]; failed: ImportRowResult[] };
      };
      if (!body.result) {
        throw new Error(body.error ?? "unknown");
      }
      if (body.result.failed.length > 0) {
        // All-or-nothing: the server refused the import and told us which
        // rows were wrong.
        setOutcome({ kind: "failed", failed: body.result.failed });
        return;
      }
      if (!response.ok) {
        throw new Error(body.error ?? "unknown");
      }
      const created = body.result.created.filter((row) => row.employee);
      setOutcome({ kind: "success", created: body.result.created });
      onImported(created.map((row) => row.employee!));
      onMessage(
        `Imported ${body.result.created.length} people${fileName ? ` from ${fileName}` : ""}.`,
      );
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can import users."
          : "The roster could not be imported. Check the file and try again.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1c2f46]">
        <UploadCloud className="size-4 text-[#196d86]" />
        Bulk import
      </h3>
      <p className="mt-1 text-xs text-[#7d8a9b]">
        Upload a roster CSV. Every row is validated; unless every row is valid, nothing is imported.
      </p>

      <div className="mt-4">
        <label htmlFor="roster-file" className="block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]">
          CSV file
        </label>
        <input
          ref={fileInputRef}
          id="roster-file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="mt-1.5 block w-full text-xs text-[#526278] file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f2f6] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#175d75]"
          onChange={(event) => pickFile(event.target.files?.[0])}
        />
        <p className="mt-1.5 text-xs text-[#9aa6b5]">
          {fileName || "No file chosen."}
        </p>
      </div>

      <details className="mt-3 rounded-lg border border-[#eef2f6] bg-[#fbfcfd] px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-[#526278]">
          Header format
        </summary>
        <p className="mt-2 whitespace-pre rounded-md bg-white p-2 font-mono text-[0.65rem] leading-relaxed text-[#526278]">
          {ROSTER_TEMPLATE}
        </p>
        <p className="mt-2 text-xs text-[#7d8a9b]">
          Columns: name, email, role (code or display name), department (name), and the optional
          manager column (an existing employee&apos;s email). Leave the manager cell empty to default
          to the department head.
        </p>
      </details>

      {outcome.kind === "success" ? (
        <p className="mt-3 rounded-lg border border-[#c4e2dc] bg-[#f0faf8] px-3 py-2 text-xs font-semibold text-[#23706b]" role="status">
          {outcome.created.length} rows imported.
        </p>
      ) : null}

      {outcome.kind === "failed" ? (
        <div className="mt-3 rounded-lg border border-[#e8c4cb] bg-[#fdf0f2] px-3 py-2" role="alert">
          <p className="text-xs font-bold text-[#a8384d]">
            Nothing was imported - {outcome.failed.length} row{outcome.failed.length === 1 ? "" : "s"} need fixing:
          </p>
          <ul className="mt-1.5 space-y-1">
            {outcome.failed.map((row) => (
              <li key={row.rowNumber} className="text-xs leading-relaxed text-[#a8384d]">
                <strong>Row {row.rowNumber}</strong>
                {row.email ? ` (${row.email})` : ""}: {row.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        className="mt-4 bg-[#175d75] px-4 text-xs font-bold text-white hover:bg-[#114b5f]"
        loading={importing}
        disabled={!csv.trim()}
        onClick={runImport}
      >
        Import roster
      </Button>
    </div>
  );
}
