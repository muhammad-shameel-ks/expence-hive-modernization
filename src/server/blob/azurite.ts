import { AzureBlobStore } from "./azure";
import type { BlobStore } from "./ports";

// Local-development factory: Azurite speaks the same Azure protocol, so the
// single adapter runs against the emulator via the well-known
// UseDevelopmentStorage connection string (ADR-0001).
export function azuriteBlobStore(): BlobStore {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The Azurite blob adapter must not run in production.");
  }
  return new AzureBlobStore("UseDevelopmentStorage=true");
}
