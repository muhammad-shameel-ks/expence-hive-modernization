import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureBlobStore } from "./azure";
import { createBlobStore } from "./compose";

const TEST_CONNECTION_STRING =
  "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net";

describe("createBlobStore", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an AzureBlobStore configured with the connection string when one is set", () => {
    vi.stubEnv("BLOB_STORAGE_CONNECTION_STRING", TEST_CONNECTION_STRING);
    vi.stubEnv("NODE_ENV", "production");

    const store = createBlobStore();

    expect(store).toBeInstanceOf(AzureBlobStore);
    expect((store as AzureBlobStore).connectionString).toBe(TEST_CONNECTION_STRING);
  });

  it("returns the Azurite store in local development without a connection string", () => {
    vi.stubEnv("BLOB_STORAGE_CONNECTION_STRING", "");
    vi.stubEnv("NODE_ENV", "development");

    const store = createBlobStore();

    expect(store).toBeInstanceOf(AzureBlobStore);
    expect((store as AzureBlobStore).connectionString).toBe("UseDevelopmentStorage=true");
  });

  it("throws in production when the connection string is missing", () => {
    vi.stubEnv("BLOB_STORAGE_CONNECTION_STRING", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createBlobStore()).toThrow(
      "BLOB_STORAGE_CONNECTION_STRING must be set in production.",
    );
  });
});
