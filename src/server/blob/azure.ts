import { BlobServiceClient, RestError } from "@azure/storage-blob";
import type { BlobStore, StoredBlob } from "./ports";
import { RECEIPTS_CONTAINER } from "./keys";

// The single Azure-protocol adapter (ADR-0004): it runs against real Azure
// Blob Storage with a production connection string and against the Azurite
// emulator with the UseDevelopmentStorage string. The container is created
// lazily on first write, which is a no-op in Azure when it already exists.
export class AzureBlobStore implements BlobStore {
  private readonly container;
  private containerReady?: Promise<void>;

  constructor(readonly connectionString: string) {
    this.container = BlobServiceClient.fromConnectionString(
      connectionString,
    ).getContainerClient(RECEIPTS_CONTAINER);
  }

  private async ensureContainer(): Promise<void> {
    this.containerReady ??= this.container.createIfNotExists().then(() => undefined);
    await this.containerReady;
  }

  async putBlob(key: string, data: Uint8Array, contentType: string): Promise<void> {
    await this.ensureContainer();
    await this.container.getBlockBlobClient(key).uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async getBlob(key: string): Promise<StoredBlob | null> {
    const blob = this.container.getBlockBlobClient(key);
    try {
      const [buffer, properties] = await Promise.all([
        blob.downloadToBuffer(),
        blob.getProperties(),
      ]);
      return {
        data: new Uint8Array(buffer),
        contentType: properties.contentType ?? "application/octet-stream",
      };
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async deleteBlob(key: string): Promise<void> {
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }
}
