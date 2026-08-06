import { Pool } from "pg";
import { createBlobStore } from "../blob/compose";
import { databaseUrl } from "@/server/db/connection.mjs";
import { createExpenseCommands, type ExpenseCommands } from "./commands";
import { PostgresExpenseStore } from "./postgres";

// Only the Pool (a real connection pool) is worth caching across Next.js dev
// hot reloads. The store and the commands closures are stateless and cheap
// to rebuild, and rebuilding them on every call guarantees this always runs
// the latest commands.ts/postgres.ts code instead of a stale cached instance
// captured before a since-edited internal behavior change.
const poolKey = Symbol.for("expensehive.expense-pool");
type GlobalStore = { [poolKey]?: Pool };
const globalStore = globalThis as GlobalStore;

export function expenseCommands(): ExpenseCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development expense adapter must not run in production.");
  }
  if (!globalStore[poolKey]) {
    globalStore[poolKey] = new Pool({ connectionString: databaseUrl });
  }
  return createExpenseCommands({
    store: new PostgresExpenseStore(globalStore[poolKey]),
    blobStore: createBlobStore(),
  });
}
