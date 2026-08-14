// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route file reads the session cookie through next/headers and resolves
// the actor through the dev auth wiring; both are stubbed here so the
// authorization boundary (no session -> 401) is testable without a server.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => mockSessionCookie() }),
}));

let mockSessionCookie: () => { value: string } | null = () => null;

describe("POST /api/receipts/extract", () => {
  beforeEach(() => {
    mockSessionCookie = () => null;
    vi.resetModules();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/receipts/extract", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("rejects an unknown session id with 401", async () => {
    mockSessionCookie = () => ({ value: "no-such-session" });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/receipts/extract", { method: "POST" }));

    expect(response.status).toBe(401);
  });
});
