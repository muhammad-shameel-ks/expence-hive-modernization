import { createAuthCommands, type AuthCommands } from "./commands";
import {
  InMemoryIdentityStore,
  InMemorySessionStore,
  InMemoryTokenStore,
} from "./in-memory";
import { MailpitEmailProvider } from "./mailpit";
import { createDevProvisioner } from "./provisioning";
import { seededEmployees } from "./seeds";
import { adminDevStore } from "../admin/dev";

const baseUrl = process.env.AUTH_BASE_URL ?? "http://localhost:3000";

// The single organization of the local dev wiring; org-1 matches
// scripts/seed.mjs ORGANIZATION.id.
const ORGANIZATION_ID = "org-1";
// First-login identities are provisioned with the seeded Executive role.
const DEFAULT_PROVISIONING_ROLE_CODE = "executive";

const globalKey = Symbol.for("expensehive.dev-auth");
type GlobalStore = { [globalKey]?: AuthCommands };
const globalStore = globalThis as GlobalStore;

export function devAuth(): AuthCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development identity adapter must not run in production.");
  }
  if (!globalStore[globalKey] || typeof globalStore[globalKey]?.createDevSession !== "function") {
    const identityProvider = new InMemoryIdentityStore(seededEmployees);
    globalStore[globalKey] = createAuthCommands({
      baseUrl,
      identityProvider,
      tokenStore: new InMemoryTokenStore(),
      sessionStore: new InMemorySessionStore(),
      emailProvider: new MailpitEmailProvider(),
      provisioner: createDevProvisioner({
        adminStore: adminDevStore(),
        identityProvider,
        organizationId: ORGANIZATION_ID,
        defaultRoleCode: DEFAULT_PROVISIONING_ROLE_CODE,
      }),
    });
  }
  return globalStore[globalKey]!;
}
