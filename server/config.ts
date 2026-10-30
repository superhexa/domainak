export const POSTGRES_USER = process.env.POSTGRES_USER || "postgres";
export const POSTGRES_PASSWORD =
  process.env.POSTGRES_PASSWORD || "postgres";
export const POSTGRES_DB = process.env.POSTGRES_DB || "postgres";

// If strictly in Docker (production), force the DB host securely.
// Otherwise, rely heavily on the local .env URL for your local terminal dev environments!
export const POSTGRES_URL =
  process.env.NODE_ENV === "production"
    ? `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}`
    : process.env.POSTGRES_URL ||
      `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}`;

export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Cloudflare API token (Zone:DNS:Edit). Needed to publish the DNS
// records managed in each domain's settings into the base domain's
// zone. Without it records are saved but stay unpublished ("pending").
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
