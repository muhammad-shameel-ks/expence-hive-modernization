import { Pool } from "pg";
import { createAdminCommands, type AdminCommands } from "./commands";
import { PostgresAdminStore } from "./postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://expensehive:expensehive@127.0.0.1:5432/expensehive";

const globalKey = Symbol.for("expensehive.admin-commands");
type GlobalStore = { [globalKey]?: AdminCommands };
const globalStore = globalThis as GlobalStore;

export function adminCommands(): AdminCommands {
  if (!globalStore[globalKey]) {
    const pool = new Pool({ connectionString });
    globalStore[globalKey] = createAdminCommands({
      store: new PostgresAdminStore(pool),
    });
  }
  return globalStore[globalKey]!;
}
