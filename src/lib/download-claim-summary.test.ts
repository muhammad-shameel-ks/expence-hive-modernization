// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadClaimSummary } from "./download-claim-summary";

const downloadBlobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/download-blob", () => ({
  downloadBlob: downloadBlobMock,
}));

describe("downloadClaimSummary", () => {
  beforeEach(() => {
    downloadBlobMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads the PDF and returns null on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70])))),
    );

    const result = await downloadClaimSummary("claim-1", "EXP-0001-summary.pdf");

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/expenses/claim-1/summary");
    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    expect(downloadBlobMock).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }), "EXP-0001-summary.pdf");
  });

  it("returns the server message on a failed response and saves no file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "Summary unavailable" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    const result = await downloadClaimSummary("claim-1", "EXP-0001-summary.pdf");

    expect(result).toBe("Summary unavailable");
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it("returns a fallback message when the server error carries no body", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))));

    const result = await downloadClaimSummary("claim-1", "EXP-0001-summary.pdf");

    expect(result).toBe("The summary could not be downloaded. Please try again.");
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it("returns the network message when the fetch rejects and saves no file", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    const result = await downloadClaimSummary("claim-1", "EXP-0001-summary.pdf");

    expect(result).toBe("Could not reach the server. Check your connection and try again.");
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });
});
