import { Pool } from "pg";
import { createAdminCommands, type AdminCommands } from "./commands";
import { PostgresAdminStore } from "./postgres";
import { databaseUrl } from "@/server/db/connection";

// Dev-only adapter. The Pool and the AdminCommands singleton live for the
// process lifetime and are never closed: acceptable for local development,
// but this module must not run in production.
const globalKey = Symbol.for("expensehive.admin-commands");
type GlobalStore = { [globalKey]?: AdminCommands };
const globalStore = globalThis as GlobalStore;

export function adminCommands(): AdminCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development admin adapter must not run in production.");
  }
  if (!globalStore[globalKey]) {
    const pool = new Pool({ connectionString: databaseUrl });
    globalStore[globalKey] = createAdminCommands({
      store: new PostgresAdminStore(pool),
    });
  }
  return globalStore[globalKey]!;
}
