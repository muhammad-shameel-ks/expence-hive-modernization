import type {
  Employee,
  IdentityProvider,
  LoginToken,
  SessionStore,
  TokenStore,
} from "./ports";

export class InMemoryIdentityStore implements IdentityProvider {
  private readonly byEmail = new Map<string, Employee>();
  private readonly byId = new Map<string, Employee>();

  constructor(employees: readonly Employee[]) {
    for (const employee of employees) {
      this.byEmail.set(employee.email.toLowerCase(), employee);
      this.byId.set(employee.id, employee);
    }
  }

  findByEmail(email: string): Employee | null {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  findById(id: string): Employee | null {
    return this.byId.get(id) ?? null;
  }
}

export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, LoginToken>();

  save(token: LoginToken): void {
    this.tokens.set(token.token, token);
  }

  consume(token: string, now: Date): LoginToken | null {
    const stored = this.tokens.get(token);
    if (!stored) {
      return null;
    }
    if (stored.usedAt !== undefined) {
      return null;
    }
    if (stored.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    stored.usedAt = now;
    return stored;
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, string>();

  create(employeeId: string): string {
    const sessionId = `session-${crypto.randomUUID()}`;
    this.sessions.set(sessionId, employeeId);
    return sessionId;
  }

  get(sessionId: string): string | null {
    return this.sessions.get(sessionId) ?? null;
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}