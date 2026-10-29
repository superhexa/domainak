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
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET; // Legacy single records zone from the first iteration of the records
// feature (tgram.records.domainak.qzz.io). Rows created before the
// per-domain `rc.<base>` zones still live here, so it keeps being served.
export const RECORDS_ZONE = (
  process.env.RECORDS_ZONE || "records.domainak.qzz.io"
)
  .toLowerCase()
  .replace(/\.+$/, "");

// Label inserted between the record name and its base domain. With the
// default "rc", a record named `tgram` on the base domain
// `domainak.qzz.io` resolves as tgram.rc.domainak.qzz.io, so tunnel/proxy
// routes (tgram.domainak.qzz.io) stay untouched.
export const RECORD_MODE_SUBDOMAIN = (
  process.env.RECORD_MODE_SUBDOMAIN || "rc"
)
  .toLowerCase()
  .replace(/\.+$/, "");

// Base domains that may own a records zone (`rc.<base>`). Defaults to every
// domain in DOMAINS except the excluded ones, so the feature follows the
// registered domains without a second list to maintain. z44d.com is kept
// out of record mode by default.
const RECORD_DOMAIN_EXCLUDES = (
  process.env.RECORD_DOMAIN_EXCLUDES || "z44d.com"
)
  .split(/[\s,]+/)
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

export const RECORD_DOMAINS: string[] = (
  process.env.RECORD_DOMAINS ||
  process.env.DOMAINS ||
  ""
)
  .split(/[\s,]+/)
  .map((item) => item.trim().toLowerCase())
  .filter(
    (item) => item.length > 0 && !RECORD_DOMAIN_EXCLUDES.includes(item),
  );

// The records zones are delegated from every supported base domain to these
// nameservers (see the NS records created in cloudflare.ts).
const RECORD_NS_PARENT = RECORDS_ZONE.split(".").slice(1).join(".");
export const RECORD_NAMESERVERS = [
  process.env.RECORD_NS1 || `ns1.${RECORD_NS_PARENT}`,
  process.env.RECORD_NS2 || `ns2.${RECORD_NS_PARENT}`,
];

// Carrier record: proxied records are published in PowerDNS as a CNAME to
// this name, which exists (proxied) in Cloudflare. Resolvers then get
// Cloudflare's anycast IPs, while TLS/HTTP keep using the record's own
// hostname. It must sit outside every delegated zone, so it lives in the
// parent of the legacy records zone.
export const RECORD_PROXY_CARRIER = (
  process.env.RECORD_PROXY_CARRIER || `edge.${RECORD_NS_PARENT}`
)
  .toLowerCase()
  .replace(/\.+$/, "");

// Cloudflare API token (Zone:DNS:Edit). Needed to publish the NS
// delegations for each `rc.<base>` zone and to manage proxied records.
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// PowerDNS HTTP API. Inside Docker the service is reachable as `pdns`;
// local development uses the host-published localhost port.
export const PDNS_API_URL =
  process.env.PDNS_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://pdns:8081"
    : "http://localhost:8081");

// Shared with the PowerDNS container (the `api-key` line in pdns.conf). The
// API port is only bound to localhost and the internal Docker network.
export const PDNS_API_KEY =
  process.env.PDNS_API_KEY || "domainak-pdns-internal";
