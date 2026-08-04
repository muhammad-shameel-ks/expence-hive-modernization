import type { Employee, EmailProvider, IdentityProvider, SessionStore, TokenStore } from "./ports";
import { magicLinkUrl } from "./ports";

export class AuthenticationError extends Error {
  readonly code: "invalid-token";

  constructor() {
    super("The magic link is invalid, used, or expired.");
    this.name = "AuthenticationError";
    this.code = "invalid-token";
  }
}

export type AuthPorts = {
  baseUrl: string;
  now?: () => Date;
  tokenFactory?: () => string;
  identityProvider: IdentityProvider;
  tokenStore: TokenStore;
  sessionStore: SessionStore;
  emailProvider: EmailProvider;
};

const TOKEN_TTL_SECONDS = 15 * 60;

export function createAuthCommands(ports: AuthPorts) {
  const now = ports.now ?? (() => new Date());
  const tokenFactory = ports.tokenFactory ?? (() => crypto.randomUUID());

  async function requestLogin(input: {
    email: string;
  }): Promise<{ accepted: true }> {
    const email = input.email.trim().toLowerCase();
    const employee = ports.identityProvider.findByEmail(email);
    if (!employee) {
      return { accepted: true };
    }

    const token = tokenFactory();
    const current = now();
    ports.tokenStore.save({
      token,
      email,
      expiresAt: new Date(current.getTime() + TOKEN_TTL_SECONDS * 1000),
    });

    await ports.emailProvider.sendMagicLink({
      to: email,
      url: magicLinkUrl(ports.baseUrl, token),
    });

    return { accepted: true };
  }

  async function completeLogin(input: {
    token: string;
  }): Promise<{ sessionId: string; employee: Employee }> {
    const token = ports.tokenStore.consume(input.token, now());
    if (!token) {
      throw new AuthenticationError();
    }
    const employee = ports.identityProvider.findByEmail(token.email);
    if (!employee) {
      throw new AuthenticationError();
    }
    return {
      sessionId: ports.sessionStore.create(employee.id),
      employee,
    };
  }

  function getCurrentEmployee(sessionId: string): Employee | null {
    const employeeId = ports.sessionStore.get(sessionId);
    if (!employeeId) {
      return null;
    }
    return ports.identityProvider.findById(employeeId);
  }

  function logout(sessionId: string): void {
    ports.sessionStore.remove(sessionId);
  }

  function createDevSession(employeeId: string): string {
    if (!ports.identityProvider.findById(employeeId)) {
      throw new AuthenticationError();
    }
    return ports.sessionStore.create(employeeId);
  }

  return { requestLogin, completeLogin, getCurrentEmployee, logout, createDevSession };
}

export type AuthCommands = ReturnType<typeof createAuthCommands>;
