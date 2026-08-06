# ADR-0001: Azure-Native Next.js MVP

Status: accepted for the prototype.

## Context

The existing application uses Angular, ABP, .NET, SQL Server, Microsoft Entra ID, Azure hosting, and Microsoft Graph email.

The replacement should use Next.js, a new normalized database, configurable approval workflows, CEO and higher-approver takeovers, audit history, receipts, and email.

Superseded by issue #39 for the CEO reference: takeovers are exercised by any later-stage role, with the Finance Head as the apex of a flow.

The replacement also requires a substantial UX redesign focused on easy task completion, responsive use, and accessibility rather than a visual port of the legacy application.

Development needs to start before production Azure permissions are available.

Supabase offers Auth, Storage, Realtime, and Postgres, but self-hosting it would introduce several services to operate.

Realtime is explicitly future scope for the MVP.

## Decision

Use a single Next.js full-stack application for the prototype.

Keep all business mutations behind protected server-side routes and domain modules.

Treat the user experience as a first-class application boundary with progressive forms, actionable approval work, visible state, responsive layouts, and WCAG 2.2 Level AA behavior.

Use local PostgreSQL, Azurite, and Mailpit during development.

Use seeded development identities until Microsoft Entra application permissions are available.

Use Azure App Service, Azure Database for PostgreSQL, Azure Blob Storage, Microsoft Entra ID, and Microsoft Graph for the intended production deployment.

Use provider adapters so local services and production services implement the same application contracts.

Do not add Supabase to the MVP.

Defer realtime and add Azure SignalR or Web PubSub behind the realtime adapter if live updates become necessary.

## Consequences

The prototype can be developed immediately without access to the company Azure tenant.

The production design remains inside the preferred Microsoft subscription boundary.

The application owns workflow authorization and can enforce transactions and audit history in one server-side boundary.

The team must implement a development-only identity adapter and must prevent it from being enabled outside local development.

The application will not receive Supabase's bundled Auth, Storage, and Realtime features automatically.

The application must implement its own provider adapters and later integrate Entra and Graph permissions.

## Revisit When

- The organization requires realtime approval queues.
- Azure permissions cannot be obtained for the intended production resources.
- The product needs a separate backend deployment for scale or team ownership.
- Supabase's combined platform materially reduces operational or development complexity.
