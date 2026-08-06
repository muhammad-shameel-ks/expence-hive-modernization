export type StoredBlob = {
  data: Uint8Array;
  contentType: string;
};

export interface BlobStore {
  putBlob(key: string, data: Uint8Array, contentType: string): Promise<void>;
  getBlob(key: string): Promise<StoredBlob | null>;
  deleteBlob(key: string): Promise<void>;
}
