This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

This project is the greenfield ExpenseHive modernization workspace.

The legacy `expensehive` directory is read-only reference material.

## Project Documents

- [Formal specification](docs/specs/expensehive-modernization.md)
- [UX research](docs/ux/ux-research.md)
- [Approval workflow domain model](docs/domain-model/approval-workflow.md)
- [Modernization architecture](docs/architecture/modernization.md)
- [Platform ADR](docs/architecture/decisions/0001-azure-native-nextjs-mvp.md)

## Getting Started

### Local Infrastructure

The local development stack follows the architecture specification and provides PostgreSQL, Azurite, and Mailpit through Docker Compose.

Start the services from this directory:

```bash
docker compose up -d
```

The local service endpoints are:

- PostgreSQL: `postgresql://expensehive:expensehive@127.0.0.1:5432/expensehive`
- Azurite Blob service: `http://127.0.0.1:10000/devstoreaccount1`
- Mailpit SMTP: `127.0.0.1:1025`
- Mailpit inbox: [http://localhost:8025](http://localhost:8025)

Apply the database schema and seed the local organization, employees, roles, and a draft workflow before starting the application:

```bash
npm run db:migrate
npm run db:seed
```

The seed is idempotent and can be rerun after migrations.

### Absence sweep worker

The absence auto-skip timeout (configurable per company in the admin console, default 3 days) is enforced by a scheduled sweep worker in addition to the lazy read-path catch-up, so stale claims advance even when nobody opens the app (ADR-0018).

Run it with the rest of the stack:

```bash
docker compose up -d sweep
```

The `sweep` service runs one pass over every organization every 15 minutes (override with `SWEEP_INTERVAL_MS`), applies pending migrations on start, and reports a heartbeat file that its healthcheck probes. For a single manual pass:

```bash
npm run sweep
```

Stop the services while keeping their local data:

```bash
docker compose down
```

Remove the containers and local data volumes:

```bash
docker compose down -v
```

The development identity adapter and seeded users described in the specification are not implemented yet.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
