import { describe, expect, it } from "vitest";
import { createAuthCommands } from "./commands";
import {
  InMemoryIdentityStore,
  InMemorySessionStore,
  InMemoryTokenStore,
} from "./in-memory";
import { RecordingEmailProvider } from "./fakes";
import {
  handleLoginRequest,
  handleLogoutRequest,
  handleVerifyRequest,
} from "./http";
import type { Employee } from "./ports";

const ada: Employee = {
  id: "emp-ada",
  email: "ada@hive.local",
  name: "Ada Lovelace",
};

const baseOrigin = "http://localhost:3000";

function buildRouteAuth(provision: (email: string) => Promise<Employee | null> = async () => null) {
  const emailProvider = new RecordingEmailProvider();
  const identityProvider = new InMemoryIdentityStore([ada]);
  const auth = createAuthCommands({
    baseUrl: baseOrigin,
    identityProvider,
    tokenStore: new InMemoryTokenStore(),
    sessionStore: new InMemorySessionStore(),
    emailProvider,
    provisioner: { provision },
  });
  return { auth, emailProvider, identityProvider };
}

describe("POST /api/auth/login", () => {
  it("accepts a known email without leaking account existence", async () => {
    const { auth, emailProvider } = buildRouteAuth();
    const request = new Request(`${baseOrigin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ada.email }),
    });

    const response = await handleLoginRequest(request, auth);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(emailProvider.sent).toHaveLength(1);
  });

  it("returns the same response for an unknown email", async () => {
    const { auth, emailProvider } = buildRouteAuth();
    const request = new Request(`${baseOrigin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stranger@hive.local" }),
    });

    const response = await handleLoginRequest(request, auth);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(emailProvider.sent).toHaveLength(0);
  });

  it("provisions a first-time identity without changing the response shape", async () => {
    const provisioned: string[] = [];
    const { auth, emailProvider, identityProvider } = buildRouteAuth(async (email) => {
      provisioned.push(email);
      const employee: Employee = { id: "emp-stranger", email, name: "Stranger Person" };
      identityProvider.register(employee);
      return employee;
    });
    const request = new Request(`${baseOrigin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "STRANGER@hive.local" }),
    });

    const response = await handleLoginRequest(request, auth);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(provisioned).toEqual(["stranger@hive.local"]);
    expect(identityProvider.findByEmail("stranger@hive.local")).not.toBeNull();
    expect(emailProvider.sent).toHaveLength(1);
  });
});

describe("GET /verify", () => {
  it("completes a magic link, sets a session cookie, and redirects", async () => {
    const { auth, emailProvider } = buildRouteAuth();
    await auth.requestLogin({ email: ada.email });
    const token = new URL(emailProvider.sent[0].url).searchParams.get("token")!;

    const response = await handleVerifyRequest(
      new Request(`${baseOrigin}/verify?token=${token}`),
      auth,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${baseOrigin}/expenses`);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("eh_session=session-");
    expect(cookie).toContain("HttpOnly");
  });

  it("marks the session cookie Secure in production", async () => {
    const { auth, emailProvider } = buildRouteAuth();
    await auth.requestLogin({ email: ada.email });
    const token = new URL(emailProvider.sent[0].url).searchParams.get("token")!;
    const previous = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    try {
      const response = await handleVerifyRequest(
        new Request(`${baseOrigin}/verify?token=${token}`),
        auth,
      );

      const cookie = response.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("; Secure");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }
  });

  it("rejects a used magic link by redirecting to the login error state", async () => {
    const { auth, emailProvider } = buildRouteAuth();
    await auth.requestLogin({ email: ada.email });
    const token = new URL(emailProvider.sent[0].url).searchParams.get("token")!;
    await auth.completeLogin({ token });

    const response = await handleVerifyRequest(
      new Request(`${baseOrigin}/verify?token=${token}`),
      auth,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${baseOrigin}/login?error=invalid-token`,
    );
  });
});

describe("POST /api/auth/logout", () => {
  it("invalidates the session and clears the cookie", async () => {
    const { auth, emailProvider } = buildRouteAuth();
    await auth.requestLogin({ email: ada.email });
    const token = new URL(emailProvider.sent[0].url).searchParams.get("token")!;
    const { sessionId } = await auth.completeLogin({ token });

    const response = await handleLogoutRequest(
      new Request(`${baseOrigin}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: `eh_session=${sessionId}` },
      }),
      auth,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${baseOrigin}/login`);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("eh_session=;");
    expect(cookie).toContain("Max-Age=0");
    expect(auth.getCurrentEmployee(sessionId)).toBeNull();
  });

  it("is a no-op redirect without a session cookie", async () => {
    const { auth } = buildRouteAuth();

    const response = await handleLogoutRequest(
      new Request(`${baseOrigin}/api/auth/logout`, { method: "POST" }),
      auth,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${baseOrigin}/login`);
  });
});