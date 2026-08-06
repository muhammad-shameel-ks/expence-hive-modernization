import { AzureBlobStore } from "./azure";
import { azuriteBlobStore } from "./azurite";
import type { BlobStore } from "./ports";

// The composition seam (ADR-0004): a connection string selects the Azure
// adapter, local development falls back to the Azurite factory, and
// production fails loudly when the string is missing.
export function createBlobStore(env = process.env): BlobStore {
  const connectionString = env.BLOB_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    return new AzureBlobStore(connectionString);
  }
  if (env.NODE_ENV === "production") {
    throw new Error("BLOB_STORAGE_CONNECTION_STRING must be set in production.");
  }
  return azuriteBlobStore();
}
