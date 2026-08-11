import { Pool } from "pg";
import { createAdminCommands, type AdminCommands } from "./commands";
import { PostgresAdminStore } from "./postgres";
import { expenseDevStore } from "@/server/expenses/dev";
import { databaseUrl } from "@/server/db/connection.mjs";
import { runMigrations } from "@/server/db/migrate";

// Dev-only adapter. The Pool and the PostgresAdminStore singleton live for the
// process lifetime and are never closed: acceptable for local development,
// but this module must not run in production.
const poolKey = Symbol.for("expensehive.admin-pool");
const storeKey = Symbol.for("expensehive.admin-store");

type GlobalStore = {
  [poolKey]?: Pool;
  [storeKey]?: PostgresAdminStore;
};

const globalStore = globalThis as GlobalStore;

export function adminDevStore(): PostgresAdminStore {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development admin adapter must not run in production.");
  }
  if (!globalStore[poolKey]) {
    const pool = new Pool({ connectionString: databaseUrl });
    globalStore[poolKey] = pool;
    runMigrations(pool).catch((error) => {
      console.error("Failed to apply pending database migrations automatically", error);
    });
  }
  if (!globalStore[storeKey]) {
    globalStore[storeKey] = new PostgresAdminStore(globalStore[poolKey]!);
  }
  return globalStore[storeKey]!;
}

export function adminCommands(): AdminCommands {
  return createAdminCommands({ store: adminDevStore(), expensesStore: expenseDevStore() });
}
