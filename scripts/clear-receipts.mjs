// One-off dev cleanup for the PDF-only receipts policy: deletes every
// claim_attachments row (the DB metadata) and every blob in the "receipts"
// Azure container (the bytes). Destructive - dev data only, never production.
// Usage: node scripts/clear-receipts.mjs

import { Pool } from "pg";
import { BlobServiceClient } from "@azure/storage-blob";
import { databaseUrl } from "../src/server/db/connection.mjs";

const RECEIPTS_CONTAINER = "receipts";

// Mirrors src/server/blob/compose.ts: an explicit BLOB_STORAGE_CONNECTION_STRING
// selects Azure, otherwise the local Azurite emulator's well-known dev string
// is used, and production fails loudly when the string is missing.
function blobConnectionString() {
  const connectionString = process.env.BLOB_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    return connectionString;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLOB_STORAGE_CONNECTION_STRING must be set in production.");
  }
  return "UseDevelopmentStorage=true";
}

async function clearBlobs(containerClient) {
  if (!(await containerClient.exists())) {
    return 0;
  }
  const names = [];
  for await (const item of containerClient.listBlobsFlat()) {
    names.push(item.name);
  }
  // Delete the container wholesale instead of one request per blob: the app
  // recreates it lazily on first write (createIfNotExists in azure.ts), so a
  // missing container is harmless between now and the next putBlob.
  await containerClient.deleteIfExists();
  return names.length;
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const serviceClient = BlobServiceClient.fromConnectionString(blobConnectionString());
  const containerClient = serviceClient.getContainerClient(RECEIPTS_CONTAINER);

  try {
    let attachmentCount = 0;
    let blobCount = 0;
    await client.query("BEGIN");
    try {
      const result = await client.query("DELETE FROM claim_attachments");
      attachmentCount = result.rowCount ?? 0;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    blobCount = await clearBlobs(containerClient);

    console.log(
      `deleted ${attachmentCount} claim_attachments row(s) and ${blobCount} blob(s) from the "${RECEIPTS_CONTAINER}" container`,
    );
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
