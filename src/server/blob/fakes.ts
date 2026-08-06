import type { BlobStore, StoredBlob } from "./ports";

export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, StoredBlob>();

  async putBlob(key: string, data: Uint8Array, contentType: string): Promise<void> {
    this.blobs.set(key, { data, contentType });
  }

  async getBlob(key: string): Promise<StoredBlob | null> {
    return this.blobs.get(key) ?? null;
  }

  async deleteBlob(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}
