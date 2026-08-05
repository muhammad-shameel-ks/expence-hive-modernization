import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresExpenseStore } from "./postgres";
import type { ExpenseClaim } from "./ports";

function buildClaim(): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-2026-0001",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Bengaluru client flight",
    category: "Travel",
    subCategory: "Airfare",
    remark: "Round trip for the Bengaluru client kickoff",
    amountMinor: 1250000,
    currency: "INR",
    expenseDate: "2026-08-04",
    paymentMethod: "Personal card",
    status: "draft",
    payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    steps: [],
    history: [{ id: "history-1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" }],
    version: 1,
    createdAt: "2026-08-04T10:00:00.000Z",
  };
}

describe("PostgresExpenseStore", () => {
  it("persists payout details and returns them when reading the claim back", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    await store.createClaim(buildClaim());

    const insertCall = query.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO reimbursement_claims"));
    expect(insertCall?.[0]).toContain("account_number");
    expect(insertCall?.[0]).toContain("ifsc_code");
    expect(insertCall?.[0]).toContain("sub_category");
    expect(insertCall?.[0]).toContain("remark");
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining(["32534240620", "SBIN0012861", "Airfare", "Round trip for the Bengaluru client kickoff"]),
    );
  });

  it("persists comments when updating a claim", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = buildClaim();
    claim.comments = "Awaiting invoice copy before payout";
    claim.version = 2;
    await store.updateClaim(claim);

    const updateCall = query.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("UPDATE reimbursement_claims"));
    expect(updateCall?.[0]).toContain("comments");
    expect(updateCall?.[1]).toEqual(expect.arrayContaining(["Awaiting invoice copy before payout"]));
  });

  it("maps account_number and ifsc_code columns back into payoutDetails", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM reimbursement_claims")) {
        return Promise.resolve({
          rows: [
            {
              id: "claim-1",
              organization_id: "org-1",
              requester_id: "emp-shameel",
              reference: "EXP-2026-0001",
              title: "Bengaluru client flight",
              category: "Travel",
              sub_category: "Airfare",
              remark: "Round trip for the Bengaluru client kickoff",
              amount_minor: "1250000",
              expense_date: "2026-08-04",
              payment_method: "Personal card",
              status: "draft",
              current_stage: null,
              current_actor_id: null,
              version: "1",
              created_at: "2026-08-04T10:00:00.000Z",
              submitted_at: null,
              account_number: "32534240620",
              ifsc_code: "SBIN0012861",
              comments: "Awaiting invoice copy before payout",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = await store.getClaim("claim-1");

    expect(claim?.payoutDetails).toEqual({ accountNumber: "32534240620", ifscCode: "SBIN0012861" });
    expect(claim).toMatchObject({
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
      comments: "Awaiting invoice copy before payout",
    });
  });

  it("lists every claim in an organization regardless of requester or assigned actor", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM reimbursement_claims")) {
        expect(sql).toContain("organization_id = $1");
        expect(sql).not.toContain("requester_id = $2");
        return Promise.resolve({
          rows: [
            {
              id: "claim-1",
              organization_id: "org-1",
              requester_id: "emp-shameel",
              reference: "EXP-2026-0001",
              title: "Bengaluru client flight",
              category: "Travel",
              amount_minor: "1250000",
              expense_date: "2026-08-04",
              payment_method: "Personal card",
              status: "in-finance",
              current_stage: "finance",
              current_actor_id: "emp-finance",
              version: "5",
              created_at: "2026-08-04T10:00:00.000Z",
              submitted_at: "2026-08-04T10:00:00.000Z",
              account_number: "32534240620",
              ifsc_code: "SBIN0012861",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claims = await store.listClaimsForOrganization("org-1");

    expect(claims).toHaveLength(1);
    expect(claims[0].payoutDetails).toEqual({ accountNumber: "32534240620", ifscCode: "SBIN0012861" });
  });
});
