// Client-side file-download seam: turns a Blob into a browser file save by
// clicking a disposable anchor with an object URL. Shared by the drawer and
// any future download surface so tests can assert on one seam.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously after click() makes Safari and Firefox save empty
  // files (Mozilla bugzilla 1282407); defer the revoke until the download
  // has had a chance to read the URL. FileSaver.js defers the same way.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
