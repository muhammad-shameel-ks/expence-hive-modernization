// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download-blob";

// jsdom does not implement URL.createObjectURL / revokeObjectURL; the seam
// is tested by defining them as spies and observing the anchor it clicks.
describe("downloadBlob", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:mock-url"),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it("clicks a detached anchor named after the file, then revokes the object URL after the download starts", () => {
    vi.useFakeTimers();
    const blob = new Blob(["pdf"], { type: "application/pdf" });

    downloadBlob(blob, "EXP-1001-summary.pdf");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("EXP-1001-summary.pdf");
    expect(anchor.getAttribute("href")).toBe("blob:mock-url");
    expect(anchor.parentElement).toBeNull();

    // The revoke is deferred so Safari/Firefox finish reading the URL first
    // (Mozilla bugzilla 1282407); it must still run eventually.
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    vi.useRealTimers();
  });
});
