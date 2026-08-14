import { describe, expect, it } from "vitest";
import {
  extractAmount,
  extractCategoryGuess,
  extractDate,
  extractVendor,
  suggestFromText,
} from "./heuristics";

describe("extractAmount", () => {
  it("returns the labeled total in minor units", () => {
    expect(extractAmount("Total: Rs. 1,250.00")).toBe(125000);
    expect(extractAmount("TOTAL ₹450")).toBe(45000);
    expect(extractAmount("Amount Payable : 800.5")).toBe(80050);
  });

  it("prefers grand total over a plain total", () => {
    const text = ["Subtotal: Rs. 1,000.00", "Grand Total: Rs. 1,180.00"].join("\n");
    expect(extractAmount(text)).toBe(118000);
  });

  it("prefers a labeled total over an earlier labeled amount", () => {
    const text = ["Amount: 500", "Total: 1,250.00"].join("\n");
    expect(extractAmount(text)).toBe(125000);
  });

  it("takes the last occurrence at equal label priority", () => {
    const text = ["Total: Rs. 100.00", "Total: Rs. 180.00"].join("\n");
    expect(extractAmount(text)).toBe(18000);
  });

  it("ignores count labels that carry no money", () => {
    expect(extractAmount("Total items: 3")).toBeUndefined();
    expect(extractAmount("Total Qty : 2")).toBeUndefined();
  });

  it("falls back to the largest currency-marked figure", () => {
    const text = ["Item A Rs. 250.00", "Item B Rs. 340.00"].join("\n");
    expect(extractAmount(text)).toBe(34000);
  });

  it("does not invent amounts from unmarked numbers", () => {
    expect(extractAmount("Bill No: 1234")).toBeUndefined();
  });

  it("accepts a comma-decimal currency figure", () => {
    expect(extractAmount("Total Rs. 12,500.50")).toBe(1250050);
  });

  it("returns nothing for an empty or non-money text", () => {
    expect(extractAmount("")).toBeUndefined();
    expect(extractAmount("Thank you for your business.")).toBeUndefined();
  });
});

describe("extractDate", () => {
  it("returns an ISO date as-is", () => {
    expect(extractDate("Date: 2026-08-10")).toBe("2026-08-10");
  });

  it("parses dd/mm/yyyy when the day is unambiguous", () => {
    expect(extractDate("14/08/2026")).toBe("2026-08-14");
  });

  it("parses mm/dd/yyyy when the month is unambiguous", () => {
    expect(extractDate("08/14/2026")).toBe("2026-08-14");
  });

  it("reads a fully ambiguous dd/mm vs mm/dd date as day-first (INR convention)", () => {
    expect(extractDate("08/09/2026")).toBe("2026-09-08");
  });

  it("parses a named month date", () => {
    expect(extractDate("Aug 14, 2026")).toBe("2026-08-14");
    expect(extractDate("14-Aug-2026")).toBe("2026-08-14");
    expect(extractDate("14th August 2026")).toBe("2026-08-14");
  });

  it("prefers a date on a dated line over an earlier bare date", () => {
    const text = ["Order: 2026-07-01", "Date of purchase: 2026-08-10"].join("\n");
    expect(extractDate(text)).toBe("2026-08-10");
  });

  it("rejects impossible dates", () => {
    expect(extractDate("32/01/2026")).toBeUndefined();
    expect(extractDate("13/13/2026")).toBeUndefined();
  });

  it("returns nothing for text without a date", () => {
    expect(extractDate("No dates here, only words.")).toBeUndefined();
  });
});

describe("extractVendor", () => {
  it("returns the first substantive business line", () => {
    const text = ["RECEIPT", "Acme Corp", "123 Main Street", "Total: Rs. 250.00"].join("\n");
    expect(extractVendor(text)).toBe("Acme Corp");
  });

  it("skips structure labels, dates, and amounts before the vendor", () => {
    const text = ["INVOICE", "Date: 2026-08-10", "Swift Cabs Pvt Ltd", "Billing Street 12", "Total: Rs. 450.00"].join("\n");
    expect(extractVendor(text)).toBe("Swift Cabs Pvt Ltd");
  });

  it("accepts an all-caps single-word merchant", () => {
    expect(extractVendor("STARBUCKS\nDate: 2026-08-10")).toBe("STARBUCKS");
  });

  it("accepts a capitalized single-word merchant", () => {
    expect(extractVendor("Swiggy\nOrder #4521\nTotal: Rs. 320.00")).toBe("Swiggy");
  });

  it("skips lowercase and ambiguous one-word lines", () => {
    expect(extractVendor("mumbai\nthank you")).toBeUndefined();
    expect(extractVendor("hello\nworld")).toBeUndefined();
  });

  it("returns nothing for a text with no plausible vendor", () => {
    expect(extractVendor("Thank you for your business.")).toBeUndefined();
  });
});

describe("extractCategoryGuess", () => {
  it("guesses Meals from restaurant keywords", () => {
    expect(extractCategoryGuess("Zomato order, dinner for the team")).toBe("Meals");
  });

  it("guesses Travel from transport keywords", () => {
    expect(extractCategoryGuess("Uber ride to the airport, toll paid")).toBe("Travel");
  });

  it("guesses Software from subscription keywords", () => {
    expect(extractCategoryGuess("GitHub subscription, Figma license")).toBe("Software");
  });

  it("guesses Hardware from equipment keywords", () => {
    expect(extractCategoryGuess("Dell monitor and keyboard")).toBe("Hardware");
  });

  it("guesses Training from course keywords", () => {
    expect(extractCategoryGuess("Udemy certification course fee")).toBe("Training");
  });

  it("matches keywords case-insensitively", () => {
    expect(extractCategoryGuess("UberRIDE")).toBe("Travel");
  });

  it("returns nothing when no keyword matches", () => {
    expect(extractCategoryGuess("Miscellaneous shopping")).toBeUndefined();
  });
});

describe("suggestFromText", () => {
  it("assembles all four suggestions from a conventional receipt text", () => {
    const text = [
      "Green Leaf Cafe",
      "MG Road, Bengaluru",
      "Date: 2026-08-10",
      "Cappuccino Rs. 150.00",
      "Sandwich Rs. 220.00",
      "Grand Total Rs. 370.00",
      "Thank you!",
    ].join("\n");
    expect(suggestFromText(text)).toEqual({
      amountMinor: 37000,
      date: "2026-08-10",
      vendor: "Green Leaf Cafe",
      categoryGuess: "Meals",
    });
  });

  it("returns an empty object for unreadable text", () => {
    expect(suggestFromText("")).toEqual({});
  });
});
