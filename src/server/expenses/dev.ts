import { Pool } from "pg";
import { createBlobStore } from "../blob/compose";
import { adminDevStore } from "../admin/dev";
import { databaseUrl } from "@/server/db/connection.mjs";
import { runMigrations } from "@/server/db/migrate";
import { createExpenseCommands, type ExpenseCommands } from "./commands";
import { createProfileCommands, type ProfileCommands } from "./profile";
import { PostgresExpenseStore } from "./postgres";

// Only the Pool (a real connection pool) is worth caching across Next.js dev
// hot reloads. The store and the commands closures are stateless and cheap
// to rebuild, and rebuilding them on every call guarantees this always runs
// the latest commands.ts/postgres.ts code instead of a stale cached instance
// captured before a since-edited internal behavior change.
const poolKey = Symbol.for("expensehive.expense-pool");
type GlobalStore = { [poolKey]?: Pool };
const globalStore = globalThis as GlobalStore;

function expensePool(): Pool {
  if (!globalStore[poolKey]) {
    const pool = new Pool({ connectionString: databaseUrl });
    globalStore[poolKey] = pool;
    runMigrations(pool).catch((error) => {
      console.error("Failed to apply pending database migrations automatically", error);
    });
  }
  return globalStore[poolKey]!;
}

// The dev expense store, shared by the expense commands and the admin
// commands' role-privilege impact queries (ADR-0015).
export function expenseDevStore(): PostgresExpenseStore {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development expense adapter must not run in production.");
  }
  return new PostgresExpenseStore(expensePool());
}

export function expenseCommands(): ExpenseCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development expense adapter must not run in production.");
  }
  return createExpenseCommands({
    store: expenseDevStore(),
    blobStore: createBlobStore(),
    // The absence auto-skip timeout is an organization setting owned by the
    // admin store (ADR-0018): the expense side reads it through the seam so
    // the lazy catch-up and the sweep enforce the configured value.
    absenceTimeout: adminDevStore(),
  });
}

export function profileCommands(): ProfileCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development profile adapter must not run in production.");
  }
  return createProfileCommands({ store: expenseDevStore() });
}
