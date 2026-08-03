import { createAuthCommands, type AuthCommands } from "./commands";
import {
  InMemoryIdentityStore,
  InMemorySessionStore,
  InMemoryTokenStore,
} from "./in-memory";
import { MailpitEmailProvider } from "./mailpit";
import { seededEmployees } from "./seeds";

const baseUrl = process.env.AUTH_BASE_URL ?? "http://localhost:3000";

const globalKey = Symbol.for("expensehive.dev-auth");
type GlobalStore = { [globalKey]?: AuthCommands };
const globalStore = globalThis as GlobalStore;

export function devAuth(): AuthCommands {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The development identity adapter must not run in production.");
  }
  if (!globalStore[globalKey]) {
    globalStore[globalKey] = createAuthCommands({
      baseUrl,
      identityProvider: new InMemoryIdentityStore(seededEmployees),
      tokenStore: new InMemoryTokenStore(),
      sessionStore: new InMemorySessionStore(),
      emailProvider: new MailpitEmailProvider(),
    });
  }
  return globalStore[globalKey]!;
}