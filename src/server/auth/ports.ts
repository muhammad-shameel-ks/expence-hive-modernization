export type Employee = {
  id: string;
  email: string;
  name: string;
};

export type LoginToken = {
  token: string;
  email: string;
  expiresAt: Date;
  usedAt?: Date;
};

export interface IdentityProvider {
  findByEmail(email: string): Employee | null;
  findById(id: string): Employee | null;
  register(employee: Employee): void;
}

// Provisioning seam for identities the identity provider has never seen: an
// adapter resolves profile attributes (title, department, manager) as
// suggestions at provision time. A future Entra/Graph adapter plugs in
// here; the dev wiring provides the fallback implementation. Provisioning
// returns null when unavailable, and callers keep the silent-accept
// behavior for unknown emails.
export interface Provisioner {
  provision(email: string): Promise<Employee | null>;
}

export interface TokenStore {
  save(token: LoginToken): void;
  consume(token: string, now: Date): LoginToken | null;
}

export interface SessionStore {
  create(employeeId: string): string;
  get(sessionId: string): string | null;
  remove(sessionId: string): void;
}

export type MagicLinkEmail = {
  to: string;
  url: string;
};

export interface EmailProvider {
  sendMagicLink(email: MagicLinkEmail): Promise<void>;
}

export function magicLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/verify?token=${encodeURIComponent(token)}`;
}