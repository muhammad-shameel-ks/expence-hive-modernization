import { randomUUID } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { afterAll, describe, expect, it } from "vitest";
import { azuriteBlobStore } from "./azurite";

async function azuriteReachable(): Promise<boolean> {
  try {
    await BlobServiceClient.fromConnectionString("UseDevelopmentStorage=true").getProperties();
    return true;
  } catch {
    return false;
  }
}

const reachable = await azuriteReachable();

describe.skipIf(!reachable)("azuriteBlobStore", () => {
  const store = azuriteBlobStore();
  const keys: string[] = [];

  afterAll(async () => {
    for (const key of keys) {
      await store.deleteBlob(key);
    }
  });

  function scopedKey(): string {
    const key = `test/${randomUUID()}`;
    keys.push(key);
    return key;
  }

  it("round-trips bytes and content type through the emulator", async () => {
    const key = scopedKey();
    const original = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);

    await store.putBlob(key, original, "image/jpeg");

    const stored = await store.getBlob(key);
    expect(stored).not.toBeNull();
    expect(stored!.data).toEqual(original);
    expect(stored!.contentType).toBe("image/jpeg");
  });

  it("returns null for a missing key", async () => {
    const stored = await store.getBlob(`test/missing/${randomUUID()}`);
    expect(stored).toBeNull();
  });

  it("deletes an existing blob", async () => {
    const key = scopedKey();
    const original = new Uint8Array([1, 2, 3, 4, 5]);

    await store.putBlob(key, original, "application/pdf");
    await store.deleteBlob(key);

    expect(await store.getBlob(key)).toBeNull();
  });

  it("does not throw when deleting a missing blob", async () => {
    await expect(
      store.deleteBlob(`test/missing/${randomUUID()}`),
    ).resolves.toBeUndefined();
  });
});
