// Applies forward-only SQL migrations in filename order.
// Usage: npm run db:migrate

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(dirname, "../db/migrations");

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://expensehive:expensehive@127.0.0.1:5432/expensehive";

async function main() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (applied.rowCount > 0) {
        console.log(`skip    ${file}`);
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  const code = typeof error === "object" && error !== null ? error.code : undefined;
  if (code === "ECONNREFUSED") {
    console.error(
      "Could not connect to PostgreSQL. Start it with `docker compose up -d db`, " +
        "or point DATABASE_URL at a running instance.",
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
