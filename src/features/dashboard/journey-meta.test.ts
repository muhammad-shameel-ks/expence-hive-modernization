import { describe, expect, it } from "vitest";
import { formatMoney, submittedLabel } from "./journey-meta";

describe("formatMoney", () => {
  it("keeps whole-dollar amounts clean", () => {
    expect(formatMoney(594)).toBe("$594");
    expect(formatMoney(620)).toBe("$620");
  });

  it("does not round away cents on a financial surface", () => {
    expect(formatMoney(594.6)).toBe("$594.60");
    expect(formatMoney(100.25)).toBe("$100.25");
  });

  it("respects the currency", () => {
    expect(formatMoney(340, "EUR")).toBe("€340");
  });
});

describe("submittedLabel", () => {
  it("renders the submission date from the ISO timestamp", () => {
    expect(submittedLabel("2026-08-03T10:42:00Z")).toBe("Aug 3");
    expect(submittedLabel("2026-07-29T13:20:00Z")).toBe("Jul 29");
  });
});
