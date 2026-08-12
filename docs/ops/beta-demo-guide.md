# ExpenseHive Beta Demo Guide

## Goal

Run ExpenseHive on a shared office server so the internal team (roughly 20-30 people) can try the full expense workflow in a browser.

This is a demo, not the production deployment.
The production path (Azure App Service, Entra ID, Graph email) is tracked separately in issue #60.

## How sign-in works in the demo

The app runs in development mode, so the login page shows a "LOCAL DEVELOPMENT" panel alongside the magic-link form.
Each person picks their name from the dropdown and clicks "Open as this user".
No email is involved, which is why the demo works without a real mail relay.

The seeded identities cover the roles you need to exercise the workflow: Executive, Manager, Finance Head, Finance Executive, Team Lead, Intern, and Superadmin.
See `scripts/seed.mjs` for the full list.

## Server setup (one time)

### Prerequisites

- Node.js 20 or newer.
- Docker with the Docker Compose plugin.
- A machine that everyone on the office network can reach.

### Install dependencies

```bash
npm install
```

### Start the local infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL, Azurite (local blob storage), and Mailpit.
PostgreSQL is the real database: expense data, users, roles, flows, and audit history all persist across restarts.

### Apply the schema and seed demo data

```bash
npm run db:migrate
npm run db:seed
```

The seed is idempotent, so you can rerun it after migrations.
It creates the org, employees, roles, two published approval flows, and a few demo claims.

### Start the app

```bash
npm run dev
```

The dev server binds to `0.0.0.0`, so it is reachable from other machines on the network.

## Team member access

- Open `http://<server-ip>:3000` from any browser on the office network.
- The login page shows the development identity dropdown.
- Pick your role and click "Open as this user".

The demo server also has the absence sweep worker available via `docker compose up -d sweep` if you want the auto-skip timeout to advance stale claims on a schedule.

## What already works

- Submitting an expense with a receipt (upload goes to Azurite locally).
- The full approval chain: per-role approval steps, holds, delegation, rejection with a reason.
- The payment queue with verification and payment marking.
- PDF expense summary and Excel export of the payment queue.
- The role-adaptive dashboard with period switching and unified filters.
- The admin console: departments, roles, privilege toggles, flows, employee creation, bulk CSV import, absence timeout, and the audit trail.

## Known demo limitations

- Sessions live in memory, so restarting the dev server logs everyone out.
- Receipts upload to Azurite on the server, so they are not backed up and are lost if the Azurite volume is removed.
- The app serves over plain HTTP on the office network.
- First load of each page is slower in dev mode because Next.js compiles routes on demand.
- The magic-link email flow points at Mailpit, which only exists on the server, so team members cannot use email sign-in during the demo.

These are demo-mode trade-offs, not production defects.
The production wiring for identity, sessions, and email is the tracked follow-up work.

## Troubleshooting

### Team members see a blank page or broken styling

Next.js blocks cross-origin access to dev assets from LAN addresses unless they are allowlisted.
`next.config.ts` auto-discovers the server's non-loopback IPv4 addresses, so this should already work.
If the server has multiple network interfaces and users still hit the "Blocked cross-origin request" message, set `ALLOWED_DEV_ORIGINS` to the missing hostnames and restart:

```bash
ALLOWED_DEV_ORIGINS=server-hostname.local,another-name npm run dev
```

### The database connection is refused

Confirm the postgres container is running and healthy: `docker compose ps`.
Then rerun `npm run db:migrate`.

### The seed fails partway

Rerun `npm run db:seed`.
The seed runs in a single transaction, so a failure rolls everything back and leaves the database unchanged.

### A page is slow on first visit

That is on-demand compilation in dev mode.
It only happens once per route, then the compiled route is cached until the server restarts.

### Everyone got logged out

Restarting the dev server clears the in-memory session store.
Have people sign in again from the dropdown.

## After the demo

Decide with the team how the real deployment should authenticate (Entra ID vs an interim email-based path) - tracked in issue #60.
That decision gates the production work: a real composition root, persistent sessions, real email, and Azure hosting.
