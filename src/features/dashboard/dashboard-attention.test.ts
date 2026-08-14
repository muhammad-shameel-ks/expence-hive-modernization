import { describe, expect, it } from "vitest";
import type { Expense } from "./mock-data";
import { groupAttentionItems } from "./dashboard-attention";

const ME = "Muhammad Shameel";
const ME_ID = "emp-shameel";

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "ex-test",
    ref: "EXP-TEST",
    title: "Test expense",
    category: "Other",
    amount: 100,
    currency: "INR",
    date: "Aug 4",
    submittedAt: "2026-08-04T09:00:00Z",
    status: "submitted",
    attachments: [],
    history: [],
    ...overrides,
  };
}

describe("groupAttentionItems", () => {
  it("keeps my in-flight claims assigned to me as the current actor", () => {
    const list = [
      expense({ id: "a", status: "submitted", nextActorId: ME_ID }),
      expense({ id: "b", status: "in-approval", nextActorId: ME_ID }),
      expense({ id: "c", status: "approved", nextActorId: ME_ID }),
      expense({ id: "d", status: "in-finance", nextActorId: ME_ID }),
    ];
    const { pending } = groupAttentionItems(list, ME, ME_ID);
    expect(pending.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("matches me by actor id even when the display name differs", () => {
    const list = [
      expense({ id: "a", status: "in-approval", nextActor: "Sanil Davis", nextActorId: ME_ID }),
    ];
    const { pending } = groupAttentionItems(list, "Sanil Davis / Manager (IT)", ME_ID);
    expect(pending.map((e) => e.id)).toEqual(["a"]);
  });

  it("falls back to name matching when no actor id is present", () => {
    const list = [expense({ id: "a", status: "in-approval", nextActor: ME })];
    const { pending } = groupAttentionItems(list, ME, ME_ID);
    expect(pending.map((e) => e.id)).toEqual(["a"]);
  });

  it("excludes in-flight claims I raised that are now with another actor", () => {
    const list = [
      expense({
        id: "a",
        status: "in-approval",
        requesterId: ME_ID,
        nextActorId: "emp-grace",
        nextActor: "Grace Hopper",
      }),
      expense({ id: "b", status: "in-finance", requesterId: ME_ID, nextActor: "Finance Officer" }),
    ];
    const { pending } = groupAttentionItems(list, ME, ME_ID);
    expect(pending).toEqual([]);
  });

  it("excludes my drafts, rejected, and paid claims even when assigned to me", () => {
    const list = [
      expense({ id: "a", status: "draft", nextActor: ME }),
      expense({ id: "b", status: "rejected", requesterId: ME_ID }),
      expense({ id: "c", status: "paid", requesterId: ME_ID }),
    ];
    const { pending } = groupAttentionItems(list, ME, ME_ID);
    expect(pending).toEqual([]);
  });

  it("includes in-finance claims I can act on as a terminal pool member, even without assignment", () => {
    const list = [
      expense({
        id: "a",
        status: "in-finance",
        requesterId: "emp-requester",
        nextActorId: "emp-finance-1",
        steps: [
          {
            id: "s-1",
            roleId: "role-finance-executive",
            roleName: "Finance Executive",
            status: "pending",
          },
        ],
      }),
    ];
    const { pending } = groupAttentionItems(list, "Rishikesh 2", "emp-finance-2", "role-finance-executive");
    expect(pending.map((e) => e.id)).toEqual(["a"]);
  });

  it("excludes in-finance claims when I hold a different role than the terminal step", () => {
    const list = [
      expense({
        id: "a",
        status: "in-finance",
        requesterId: "emp-requester",
        nextActorId: "emp-finance-1",
        steps: [
          {
            id: "s-1",
            roleId: "role-finance-executive",
            roleName: "Finance Executive",
            status: "pending",
          },
        ],
      }),
    ];
    const { pending } = groupAttentionItems(list, "Pramod", "emp-pramod", "role-finance-head");
    expect(pending).toEqual([]);
  });

  it("excludes my own in-finance claim even when I hold the terminal role", () => {
    const list = [
      expense({
        id: "a",
        status: "in-finance",
        requesterId: ME_ID,
        nextActorId: "emp-finance-1",
        steps: [
          {
            id: "s-1",
            roleId: "role-finance-executive",
            roleName: "Finance Executive",
            status: "pending",
          },
        ],
      }),
    ];
    const { pending } = groupAttentionItems(list, ME, ME_ID, "role-finance-executive");
    expect(pending).toEqual([]);
  });

  it("returns empty groups for an empty list", () => {
    expect(groupAttentionItems([], ME, ME_ID)).toEqual({ pending: [] });
  });

  it("includes every claim assigned to me, with no pause state exempting any", () => {
    const list = [
      expense({ id: "a", status: "in-approval", nextActorId: ME_ID }),
      expense({ id: "b", status: "in-approval", nextActorId: ME_ID }),
    ];
    const { pending } = groupAttentionItems(list, ME, ME_ID);
    expect(pending.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("surfaces an in-finance claim to a terminal pool member with no pause exemption", () => {
    const list = [
      expense({
        id: "a",
        status: "in-finance",
        requesterId: "emp-requester",
        nextActorId: "emp-finance-1",
        steps: [
          {
            id: "s-1",
            roleId: "role-finance-executive",
            roleName: "Finance Executive",
            status: "pending",
          },
        ],
      }),
    ];
    const { pending } = groupAttentionItems(list, "Rishikesh 2", "emp-finance-2", "role-finance-executive");
    expect(pending.map((e) => e.id)).toEqual(["a"]);
  });
});
