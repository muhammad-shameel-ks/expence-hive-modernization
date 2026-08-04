// Single source of truth for the local PostgreSQL connection string.
// The fallback matches the docker-compose dev database (README); production
// deployments must set DATABASE_URL and never rely on this default.

export const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://expensehive:expensehive@127.0.0.1:5432/expensehive";
