// Enforces the company-wise absence auto-skip timeout (ADR-0018) across
// every organization on a schedule, so stale claims advance even when
// nobody opens the app. The lazy read-path catch-up stays as a backstop;
// this worker runs the identical sweepAbsentClaims command, so the two
// paths share one implementation.
//
// Usage:
//   npm run sweep          - one pass, then exit (handy for dev and cron)
//   npm run sweep:worker   - loop forever, one pass per SWEEP_INTERVAL_MS
//
// The loop mode writes a heartbeat file after each successful pass (and
// removes it before starting one), which the compose.yaml sweep service
// healthcheck probes.

import { unlink, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import type { BlobStore } from "../src/server/blob/ports";
import { databaseUrl } from "../src/server/db/connection.mjs";
import { PostgresAdminStore } from "../src/server/admin/postgres";
import { createExpenseCommands } from "../src/server/expenses/commands";
import { PostgresExpenseStore } from "../src/server/expenses/postgres";
import { runAbsenceSweep } from "../src/server/expenses/absence-sweep";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const HEARTBEAT_PATH = process.env.SWEEP_HEARTBEAT_PATH ?? "/tmp/expensehive-sweep-ok";

// The sweep only ever reads and updates claim rows; it never touches
// receipt bytes. A no-op blob store keeps the expense commands
// constructible without pulling blob infrastructure into the worker.
const noopBlobStore: BlobStore = {
  putBlob: async () => {},
  getBlob: async () => null,
  deleteBlob: async () => {},
};

function intervalMs(): number {
  const raw = process.env.SWEEP_INTERVAL_MS;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_INTERVAL_MS;
}

function logReport(report: Awaited<ReturnType<typeof runAbsenceSweep>>): number {
  let advanced = 0;
  for (const pass of report.passes) {
    advanced += pass.advanced.length;
    for (const claim of pass.advanced) {
      const detail = claim.history.at(-1)?.detail;
      console.log(
        `sweep: ${claim.ref} (${pass.organizationId}) advanced${detail ? ` - ${detail}` : ""}`,
      );
    }
  }
  console.log(
    `sweep pass complete: ${advanced} claim(s) advanced across ${report.organizationCount} organization(s)`,
  );
  return advanced;
}

async function runPass(pool: Pool): Promise<void> {
  const adminStore = new PostgresAdminStore(pool);
  const commands = createExpenseCommands({
    store: new PostgresExpenseStore(pool),
    blobStore: noopBlobStore,
    absenceTimeout: adminStore,
  });
  logReport(await runAbsenceSweep(commands, adminStore));
}

async function runOnce(pool: Pool): Promise<void> {
  await runPass(pool);
  await pool.end();
}

async function runLoop(pool: Pool): Promise<void> {
  const interval = intervalMs();
  console.log(`sweep worker started: pass every ${interval}ms, heartbeat ${HEARTBEAT_PATH}`);
  for (;;) {
    // The heartbeat is removed before the pass and written only after a
    // successful one, so the compose healthcheck reflects the last pass
    // instead of merely the process being alive.
    await unlink(HEARTBEAT_PATH).catch(() => {});
    try {
      await runPass(pool);
      await writeFile(HEARTBEAT_PATH, String(Date.now()), "utf8");
    } catch (error) {
      console.error(
        "sweep pass failed",
        error instanceof Error ? error : String(error),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const looping = process.argv.includes("--loop");
  try {
    if (looping) {
      await runLoop(pool);
    } else {
      await runOnce(pool);
    }
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === "ECONNREFUSED") {
      console.error(
        "Could not connect to PostgreSQL. Start it with `docker compose up -d postgres`, " +
          "or point DATABASE_URL at a running instance.",
      );
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
