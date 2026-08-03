import { describe, expect, it } from "vitest";
import { createAuthCommands } from "./commands";
import {
  InMemoryIdentityStore,
  InMemorySessionStore,
  InMemoryTokenStore,
} from "./in-memory";
import { RecordingEmailProvider } from "./fakes";
import type { Employee } from "./ports";

const ada: Employee = {
  id: "emp-ada",
  email: "ada@hive.local",
  name: "Ada Lovelace",
};

const fixedNow = new Date("2026-08-03T12:00:00.000Z");

function buildAuth() {
  let clock = fixedNow;
  const identityProvider = new InMemoryIdentityStore([ada]);
  const tokenStore = new InMemoryTokenStore();
  const sessionStore = new InMemorySessionStore();
  const emailProvider = new RecordingEmailProvider();
  const auth = createAuthCommands({
    baseUrl: "http://localhost:3000",
    now: () => clock,
    identityProvider,
    tokenStore,
    sessionStore,
    emailProvider,
  });
  return {
    auth,
    emailProvider,
    sessionStore,
    advance(seconds: number) {
      clock = new Date(clock.getTime() + seconds * 1000);
    },
  };
}

describe("requestLogin", () => {
  it("sends a one-time magic link to a seeded identity", async () => {
    const { auth, emailProvider } = buildAuth();

    const result = await auth.requestLogin({ email: ada.email });

    expect(result).toEqual({ accepted: true });
    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0].to).toBe(ada.email);
    expect(emailProvider.sent[0].url).toMatch(/^http:\/\/localhost:3000\/verify\?token=/);
  });

  it("does not reveal whether an email is known", async () => {
    const { auth, emailProvider } = buildAuth();

    const result = await auth.requestLogin({ email: "stranger@hive.local" });

    expect(result).toEqual({ accepted: true });
    expect(emailProvider.sent).toHaveLength(0);
  });
});

describe("completeLogin", () => {
  it("signs in the employee once with a valid magic link", async () => {
    const { auth, emailProvider, sessionStore } = buildAuth();
    await auth.requestLogin({ email: ada.email });
    const token = tokenFrom(emailProvider.sent[0].url);

    const session = await auth.completeLogin({ token });

    expect(session.employee).toMatchObject({ email: ada.email, name: "Ada Lovelace" });
    expect(session.sessionId).toBeTruthy();
    expect(sessionStore.get(session.sessionId)).toBe(ada.id);
  });

  it("rejects a magic link that has already been used", async () => {
    const { auth, emailProvider } = buildAuth();
    await auth.requestLogin({ email: ada.email });
    const token = tokenFrom(emailProvider.sent[0].url);
    await auth.completeLogin({ token });

    await expect(auth.completeLogin({ token })).rejects.toMatchObject({
      code: "invalid-token",
    });
  });

  it("rejects an expired magic link", async () => {
    const { auth, emailProvider, advance } = buildAuth();
    await auth.requestLogin({ email: ada.email });
    const token = tokenFrom(emailProvider.sent[0].url);
    advance(30 * 60);

    await expect(auth.completeLogin({ token })).rejects.toMatchObject({
      code: "invalid-token",
    });
  });
});

describe("getCurrentEmployee", () => {
  it("resolves the employee behind an active session", async () => {
    const { auth, emailProvider } = buildAuth();
    await auth.requestLogin({ email: ada.email });
    const { sessionId } = await auth.completeLogin({
      token: tokenFrom(emailProvider.sent[0].url),
    });

    const employee = auth.getCurrentEmployee(sessionId);

    expect(employee).toMatchObject({ id: ada.id, email: ada.email, name: "Ada Lovelace" });
  });

  it("returns null for an unknown or stale session id", () => {
    const { auth } = buildAuth();

    expect(auth.getCurrentEmployee("session-unknown")).toBeNull();
  });
});

describe("logout", () => {
  it("invalidates the session so it can no longer resolve an employee", async () => {
    const { auth, emailProvider } = buildAuth();
    await auth.requestLogin({ email: ada.email });
    const { sessionId } = await auth.completeLogin({
      token: tokenFrom(emailProvider.sent[0].url),
    });

    auth.logout(sessionId);

    expect(auth.getCurrentEmployee(sessionId)).toBeNull();
  });
});

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get("token")!;
}