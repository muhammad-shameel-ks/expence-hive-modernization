import { Pool } from "pg";
import { createAdminCommands, type AdminCommands } from "./commands";
import { PostgresAdminStore } from "./postgres";
import { databaseUrl } from "@/server/db/connection.mjs";

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

export function adminCommands(): AdminCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development admin adapter must not run in production.");
  }
  if (!globalStore[poolKey]) {
    globalStore[poolKey] = new Pool({ connectionString: databaseUrl });
  }
  if (!globalStore[storeKey]) {
    globalStore[storeKey] = new PostgresAdminStore(globalStore[poolKey]!);
  }
  return createAdminCommands({
    store: globalStore[storeKey]!,
  });
}
