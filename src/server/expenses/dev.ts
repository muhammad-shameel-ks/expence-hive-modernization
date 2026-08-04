import { Pool } from "pg";
import { databaseUrl } from "@/server/db/connection.mjs";
import { createExpenseCommands, type ExpenseCommands } from "./commands";
import { PostgresExpenseStore } from "./postgres";

const globalKey = Symbol.for("expensehive.expense-commands");
type GlobalStore = { [globalKey]?: ExpenseCommands };
const globalStore = globalThis as GlobalStore;

export function expenseCommands(): ExpenseCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development expense adapter must not run in production.");
  }
  if (!globalStore[globalKey] || typeof globalStore[globalKey]?.approveStage !== "function") {
    const pool = new Pool({ connectionString: databaseUrl });
    globalStore[globalKey] = createExpenseCommands({ store: new PostgresExpenseStore(pool) });
  }
  return globalStore[globalKey]!;
}
