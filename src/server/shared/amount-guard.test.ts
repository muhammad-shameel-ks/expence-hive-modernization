import { describe, expect, it } from "vitest";
import {
  autoSkipDetail,
  formatGuardAmount,
  guardFromRow,
  guardSatisfied,
  minorToRupees,
  rupeesToMinor,
  simplifyAutoSkipDetail,
} from "./amount-guard";

describe("amount-guard shared module", () => {
  describe("rupeesToMinor", () => {
    it("converts whole rupees to paise", () => {
      expect(rupeesToMinor("5000")).toBe(500000);
    });

    it("converts rupees with paise to paise", () => {
      expect(rupeesToMinor("305.50")).toBe(30550);
      expect(rupeesToMinor("5000.5")).toBe(500050);
    });

    it("rejects malformed amounts", () => {
      expect(rupeesToMinor("")).toBeNull();
      expect(rupeesToMinor("12.345")).toBeNull();
      expect(rupeesToMinor("abc")).toBeNull();
      expect(rupeesToMinor("-5")).toBeNull();
    });
  });

  describe("minorToRupees", () => {
    it("renders paise as rupees, dropping a clean .00 suffix", () => {
      expect(minorToRupees(500000)).toBe("5000");
      expect(minorToRupees(30550)).toBe("305.50");
    });

    it("renders empty for null or undefined", () => {
      expect(minorToRupees(null)).toBe("");
      expect(minorToRupees(undefined)).toBe("");
    });
  });

  describe("formatGuardAmount", () => {
    it("renders whole rupees without decimals and paise with two digits", () => {
      expect(formatGuardAmount(500000)).toBe("₹5000");
      expect(formatGuardAmount(30550)).toBe("₹305.50");
    });
  });

  describe("guardSatisfied", () => {
    it("obeys operator boundaries", () => {
      expect(guardSatisfied({ operator: "gte", amountMinor: 500000 }, 500000)).toBe(true);
      expect(guardSatisfied({ operator: "gt", amountMinor: 500000 }, 500000)).toBe(false);
      expect(guardSatisfied({ operator: "lte", amountMinor: 500000 }, 500000)).toBe(true);
      expect(guardSatisfied({ operator: "lt", amountMinor: 500000 }, 500000)).toBe(false);
      expect(guardSatisfied({ operator: "gte", amountMinor: 500000 }, 600000)).toBe(true);
      expect(guardSatisfied({ operator: "lte", amountMinor: 500000 }, 600000)).toBe(false);
    });
  });

  describe("autoSkipDetail", () => {
    it("formats user-facing auto-skip detail string with role name", () => {
      expect(
        autoSkipDetail(30000, { operator: "gte", amountMinor: 500000 }, "Finance Head"),
      ).toBe("Total ₹300 under ₹5000 guard on Finance Head step");
    });
  });

  describe("guardFromRow", () => {
    it("returns null when guard_operator is null or undefined", () => {
      expect(guardFromRow({})).toBeNull();
      expect(guardFromRow({ guard_operator: null, guard_amount_minor: null })).toBeNull();
    });

    it("maps DB row columns to AmountGuard", () => {
      expect(guardFromRow({ guard_operator: "gte", guard_amount_minor: 500000 })).toEqual({
        operator: "gte",
        amountMinor: 500000,
      });
    });
  });

  describe("simplifyAutoSkipDetail", () => {
    it("drops claim total and keeps skip condition", () => {
      expect(
        simplifyAutoSkipDetail("Total ₹1999 at or under ₹2000 guard on Finance Head step"),
      ).toBe("at or under ₹2000");
    });

    it("returns unrecognized string unchanged", () => {
      expect(simplifyAutoSkipDetail("Unrecognized reason")).toBe("Unrecognized reason");
    });
  });
});
