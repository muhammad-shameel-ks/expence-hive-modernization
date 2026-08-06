import { describe, expect, it } from "vitest";
import { matchesActivityQuery } from "./my-activity";
import type { ActivityItem } from "./mock-data";

function item(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: "act-1",
    claimId: "claim-1",
    claimRef: "EXP-2026-0001",
    claimTitle: "Client dinner",
    claimCategory: "Meals",
    amount: 240,
    currency: "INR",
    requesterName: "Muhammad Shameel",
    kind: "approved",
    date: "Aug 4, 10:00",
    ...overrides,
  };
}

describe("matchesActivityQuery", () => {
  it("matches everything for an empty or whitespace-only query", () => {
    expect(matchesActivityQuery(item({}), "")).toBe(true);
    expect(matchesActivityQuery(item({}), "   ")).toBe(true);
  });

  it("matches the requester's name, case-insensitively", () => {
    expect(matchesActivityQuery(item({ requesterName: "Sanil Davis" }), "sanil")).toBe(true);
    expect(matchesActivityQuery(item({ requesterName: "Sanil Davis" }), "ada")).toBe(false);
  });

  it("matches the claim title, ref, and category", () => {
    const claim = item({ claimTitle: "USB-C hub", claimRef: "EXP-2026-0120", claimCategory: "Hardware" });
    expect(matchesActivityQuery(claim, "usb-c")).toBe(true);
    expect(matchesActivityQuery(claim, "0120")).toBe(true);
    expect(matchesActivityQuery(claim, "hardware")).toBe(true);
  });

  it("matches the amount as a plain number or formatted currency", () => {
    const claim = item({ amount: 594, currency: "INR" });
    expect(matchesActivityQuery(claim, "594")).toBe(true);
    expect(matchesActivityQuery(claim, "₹594")).toBe(true);
  });

  it("matches the action label and detail text", () => {
    const claim = item({ kind: "rejected", detail: "Missing itemized receipt" });
    expect(matchesActivityQuery(claim, "rejected")).toBe(true);
    expect(matchesActivityQuery(claim, "itemized")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesActivityQuery(item({}), "zzz-no-such-thing")).toBe(false);
  });
});
