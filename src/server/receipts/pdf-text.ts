import path from "node:path";
import { pathToFileURL } from "node:url";

// The PDF text-layer reader (ADR-0025): extracts the selectable text layer
// of a PDF with the already-installed pdfjs-dist. This is the local
// adapter's OCR stand-in for text-based PDFs (including the server-generated
// expense summary PDF); scanned images are deferred to a later slice.
//
// The legacy build is used because it runs on Node without a worker: pdf.js
// falls back to its fake worker on the main thread, which is exactly right
// for a short-lived server-side extraction. The worker source and the
// standard font data are passed as explicit filesystem paths because a
// bundled server runtime (Next.js) cannot derive them from import.meta.url,
// and pdf.js's Node binary-data factory reads the fonts with fs.
const PDFJS_DIR = path.join(process.cwd(), "node_modules", "pdfjs-dist");
const WORKER_SRC = pathToFileURL(
  path.join(PDFJS_DIR, "legacy", "build", "pdf.worker.min.mjs"),
).toString();
const STANDARD_FONT_DIR = path.join(PDFJS_DIR, "standard_fonts", path.sep);

// Extraction failure returns null: an unreadable PDF is a normal outcome
// for the flow, not an exception the caller must classify.
export async function extractPdfTextLayer(data: Uint8Array): Promise<string | null> {
  try {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const task = getDocument({
      data,
      standardFontDataUrl: STANDARD_FONT_DIR,
    });
    const pdf = await task.promise;
    try {
      let text = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        // Text items carry a hasEOL flag that marks the visual line breaks;
        // preserving them keeps the line-oriented heuristics meaningful.
        let line = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += item.str;
          if (item.hasEOL) {
            text += line + "\n";
            line = "";
          }
        }
        if (line.length > 0) text += line + "\n";
        page.cleanup();
      }
      return text;
    } finally {
      await task.destroy();
    }
  } catch {
    return null;
  }
}
