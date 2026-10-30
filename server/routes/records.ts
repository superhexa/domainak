import { isIP } from "node:net";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { CfError, ensureRecordZoneDelegation } from "../cloudflare";
import {
  PDNS_API_KEY,
  PDNS_API_URL,
  RECORD_DOMAINS,
  RECORD_MODE_SUBDOMAIN,
  RECORD_NAMESERVERS,
} from "../config";
import { db } from "../db";
import {
  bannedDomainsTable,
  bannedIpsTable,
  dnsRecordsTable,
} from "../db/schema";
import { jwtMiddleware } from "../middleware/auth";

// DNS records live in zones served by our own PowerDNS server, delegated
// from each supported base domain as `rc.<base>` (Cloudflare only holds the
// NS records), so record counts are unlimited. Postgres is the source of
// truth: every change rebuilds the affected rrset from the stored rows.

export const recordsRouter = new Hono<{ Variables: { user: any } }>();
recordsRouter.use("*", jwtMiddleware);

type RecordType = "A" | "AAAA" | "CNAME" | "TXT";
type RecordMode = "dns-only";
const RECORD_TYPES: RecordType[] = ["A", "AAAA", "CNAME", "TXT"];
const RECORD_MODES: RecordMode[] = ["dns-only"];

function isRecordType(value: string): value is RecordType {
  return RECORD_TYPES.includes(value as RecordType);
}

function isRecordMode(value: string): value is RecordMode {
  return RECORD_MODES.includes(value as RecordMode);
}

// Labels may start with an underscore so names like _acme-challenge or
// _dmarc fit; everything else follows the usual hostname rules.
const LABEL_PATTERN = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9])?$/;

const DEFAULT_TTL = 300;
const MIN_TTL = 60;
const MAX_TTL = 86400;
const MAX_NAME_LENGTH = 253;
const MAX_TXT_LENGTH = 255;
const RRSET_TYPES: RecordType[] = ["A", "AAAA", "CNAME", "TXT"];

function zoneForBase(base: string): string {
  return RECORD_MODE_SUBDOMAIN ? `${RECORD_MODE_SUBDOMAIN}.${base}` : base;
}

type NameResult =
  | { base: string; zone: string; fqdn: string }
  | { error: string };

// Turns { base, name } into the fully qualified owner inside that base
// domain's records zone. The name may be relative ("tgram"), "@" for the
// zone apex, or pasted as a full name inside the zone.
function normalizeTarget(
  baseInput: unknown,
  nameInput: unknown,
): NameResult {
  const base = String(baseInput ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!base) {
    return { error: "Pick a domain for the record" };
  }
  if (!RECORD_DOMAINS.includes(base)) {
    return {
      error: `DNS records are not available for ${base}`,
    };
  }

  const zone = zoneForBase(base);
  const raw = String(nameInput ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\.+$/, "");

  let owner = raw;
  if (raw === "@" || raw === "") {
    owner = "";
  } else if (raw === zone) {
    owner = "";
  } else if (raw.endsWith(`.${zone}`)) {
    owner = raw.slice(0, -(zone.length + 1));
  }

  if (owner) {
    for (const label of owner.split(".")) {
      if (!LABEL_PATTERN.test(label)) {
        return {
          error:
            "Invalid name: use letters, numbers, hyphens and underscores",
        };
      }
    }
  }

  const fqdn = owner ? `${owner}.${zone}` : zone;
  if (fqdn.length > MAX_NAME_LENGTH) {
    return { error: "Name is too long" };
  }
  return { base, zone, fqdn };
}

type ValueResult = { value: string; error?: string };

function normalizeRecordValue(
  type: RecordType,
  input: unknown,
): ValueResult {
  const raw = String(input ?? "").trim();

  if (type === "A" || type === "AAAA") {
    const version = type === "A" ? 4 : 6;
    if (isIP(raw) !== version) {
      return {
        value: "",
        error: `${type} value must be a valid IPv${version} address`,
      };
    }
    return { value: version === 6 ? raw.toLowerCase() : raw };
  }

  if (type === "CNAME") {
    const target = raw.toLowerCase().replace(/\.+$/, "");
    const labels = target.split(".");
    if (labels.length < 2 || target.length > MAX_NAME_LENGTH) {
      return {
        value: "",
        error: "CNAME value must be a hostname like app.example.com",
      };
    }
    for (const label of labels) {
      if (!LABEL_PATTERN.test(label)) {
        return {
          value: "",
          error: "CNAME value must be a valid hostname",
        };
      }
    }
    return { value: target };
  }

  if (!raw || raw.length > MAX_TXT_LENGTH) {
    return {
      value: "",
      error: `TXT value must be 1-${MAX_TXT_LENGTH} characters`,
    };
  }
  if (raw.includes('"')) {
    return { value: "", error: "TXT value cannot contain double quotes" };
  }
  return { value: raw };
}

type RecordRow = typeof dnsRecordsTable.$inferSelect;

class PdnsError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PdnsError";
    this.status = status;
  }
}

function pdnsErrorFromBody(status: number, text: string): PdnsError {
  try {
    const body = JSON.parse(text) as { error?: string };
    if (body.error) {
      return new PdnsError(status, body.error);
    }
  } catch {
    // PowerDNS sometimes answers with plain text; fall through to it.
  }
  return new PdnsError(status, text || `PowerDNS responded ${status}`);
}

async function pdnsRequest(path: string, init?: RequestInit) {
  const response = await fetch(
    `${PDNS_API_URL}/api/v1/servers/localhost${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": PDNS_API_KEY,
        ...init?.headers,
      },
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw pdnsErrorFromBody(response.status, text);
  }
  return response;
}

function soaSerial() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return Number(
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}01`,
  );
}

const zoneReady = new Map<string, Promise<void>>();

// Lazily creates a PowerDNS zone (`rc.<base>` or the legacy records zone)
// the first time a record needs it, and caches the result.
function ensureZone(zone: string): Promise<void> {
  let pending = zoneReady.get(zone);
  if (!pending) {
    pending = createZone(zone).catch((error) => {
      zoneReady.delete(zone);
      throw error;
    });
    zoneReady.set(zone, pending);
  }
  return pending;
}

async function createZone(zone: string) {
  const fqdn = `${zone}.`;
  const response = await fetch(
    `${PDNS_API_URL}/api/v1/servers/localhost/zones`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": PDNS_API_KEY,
      },
      body: JSON.stringify({
        name: fqdn,
        kind: "Native",
        nameservers: RECORD_NAMESERVERS.map(
          (nameserver) => `${nameserver}.`,
        ),
      }),
    },
  );
  if (response.status === 409) {
    return;
  }
  if (!response.ok) {
    const text = await response.text();
    throw pdnsErrorFromBody(response.status, text);
  }

  await pdnsRequest(`/zones/${encodeURIComponent(fqdn)}`, {
    method: "PATCH",
    body: JSON.stringify({
      rrsets: [
        {
          name: fqdn,
          type: "SOA",
          ttl: 3600,
          changetype: "REPLACE",
          records: [
            {
              content: `${RECORD_NAMESERVERS[0]}. hostmaster.${fqdn} ${soaSerial()} 10800 3600 604800 3600`,
              disabled: false,
            },
          ],
        },
        {
          name: fqdn,
          type: "NS",
          ttl: 3600,
          changetype: "REPLACE",
          records: RECORD_NAMESERVERS.map((nameserver) => ({
            content: `${nameserver}.`,
            disabled: false,
          })),
        },
      ],
    }),
  });
}

async function rowsForName(name: string): Promise<RecordRow[]> {
  return db
    .select()
    .from(dnsRecordsTable)
    .where(eq(dnsRecordsTable.name, name))
    .orderBy(asc(dnsRecordsTable.id));
}

function toPowerDnsContent(type: string, value: string) {
  if (type === "CNAME") {
    return `${value}.`;
  }
  if (type === "TXT") {
    return `"${value}"`;
  }
  return value;
}

async function patchRrsets(
  zone: string,
  rrsets: Record<string, unknown>[],
): Promise<void> {
  if (rrsets.length === 0) {
    return;
  }
  const zonePath = `/zones/${encodeURIComponent(`${zone}.`)}`;
  try {
    await pdnsRequest(zonePath, {
      method: "PATCH",
      body: JSON.stringify({ rrsets }),
    });
  } catch (error) {
    if (error instanceof PdnsError && error.status === 404) {
      // The zone does not exist yet in PowerDNS; deleting nothing is fine.
      return;
    }
    throw error;
  }
}

// Rebuilds every rrset at `fqdn` in its zone from the stored rows. This is
// the only function that writes to PowerDNS for a name, so row and DNS state
// can never drift apart.
async function publishName(fqdn: string, zone: string): Promise<void> {
  const rows = await rowsForName(fqdn);

  if (rows.length === 0) {
    await patchRrsets(
      zone,
      RRSET_TYPES.map((type) => ({
        name: `${fqdn}.`,
        type,
        changetype: "DELETE",
      })),
    );
    return;
  }

  const _mode = (rows[0]?.recordMode ?? "dns-only") as RecordMode;

  const byType = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const bucket = byType.get(row.type) ?? [];
    bucket.push(row);
    byType.set(row.type, bucket);
  }

  const rrsets: Record<string, unknown>[] = [];
  for (const [type, bucket] of byType) {
    rrsets.push({
      name: `${fqdn}.`,
      type,
      changetype: "REPLACE",
      ttl: bucket[bucket.length - 1]?.ttl ?? DEFAULT_TTL,
      records: bucket.map((row) => ({
        content: toPowerDnsContent(row.type, row.value),
        disabled: false,
      })),
    });
  }
  if (!byType.has("CNAME")) {
    rrsets.push({ name: `${fqdn}.`, type: "CNAME", changetype: "DELETE" });
  }
  await patchRrsets(zone, rrsets);
}

async function findBannedError(
  name: string,
  type: RecordType,
  value: string,
): Promise<string | null> {
  const bannedDomain = await db
    .select({ id: bannedDomainsTable.id })
    .from(bannedDomainsTable)
    .where(eq(bannedDomainsTable.domain, name));
  if (bannedDomain.length > 0) {
    return "Domain is banned";
  }

  const target = type === "TXT" ? null : value;
  if (target) {
    const bannedTarget = await db
      .select({ id: bannedIpsTable.id })
      .from(bannedIpsTable)
      .where(eq(bannedIpsTable.ip, target));
    if (bannedTarget.length > 0) {
      return "IP Address is banned";
    }
  }
  return null;
}

// Prepares every `rc.<base>` zone at boot: creates the PowerDNS zone and
// the NS delegation in the parent zone, so lookups never hit a REFUSED
// nameserver and the first record does not wait for zone creation. Failures
// are logged and retried lazily on the next write.
export function warmupRecordZones(): void {
  for (const base of RECORD_DOMAINS) {
    const zone = zoneForBase(base);
    ensureZone(zone)
      .then(() => ensureRecordZoneDelegation(base))
      .then(() => console.log(`Record zone ready: ${zone}`))
      .catch((error) => {
        console.error(`Failed to prepare record zone ${zone}:`, error);
      });
  }
}

// Lists the records of this user plus the base domains that support record
// mode, so the dashboard can render the suffix picker without a second call.
recordsRouter.get("/", async (c) => {
  const user = c.get("user");
  const records = await db
    .select()
    .from(dnsRecordsTable)
    .where(eq(dnsRecordsTable.userId, user.id))
    .orderBy(asc(dnsRecordsTable.name), asc(dnsRecordsTable.id));

  return c.json({
    records,
    domains: RECORD_DOMAINS.map((domain) => ({
      domain,
      zone: zoneForBase(domain),
    })),
  });
});

recordsRouter.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const type = String(body.type ?? "").toUpperCase();
  if (!isRecordType(type)) {
    return c.json(
      { error: "Type must be one of A, AAAA, CNAME, TXT" },
      400,
    );
  }

  const modeInput = String(body.mode ?? "dns-only");
  if (!isRecordMode(modeInput)) {
    return c.json({ error: "Mode must be dns-only" }, 400);
  }
  const mode: RecordMode = modeInput;

  const ttl = Number(body.ttl ?? DEFAULT_TTL);
  if (!Number.isInteger(ttl) || ttl < MIN_TTL || ttl > MAX_TTL) {
    return c.json(
      { error: `TTL must be between ${MIN_TTL} and ${MAX_TTL} seconds` },
      400,
    );
  }

  const target = normalizeTarget(body.base, body.name);
  if ("error" in target) {
    return c.json({ error: target.error }, 400);
  }
  const { base, zone, fqdn } = target;

  const valueResult = normalizeRecordValue(type, body.value);
  if ("error" in valueResult) {
    return c.json({ error: valueResult.error }, 400);
  }
  const value = valueResult.value;

  const banned = await findBannedError(fqdn, type, value);
  if (banned) {
    return c.json({ error: banned }, 403);
  }

  const existing = await rowsForName(fqdn);
  if (existing.length > 0) {
    const existingMode = existing[0]?.recordMode ?? "dns-only";
    if (existingMode !== mode) {
      return c.json(
        {
          error: `All records for ${fqdn} must use the same mode. Delete the existing records first.`,
        },
        400,
      );
    }
    const hasCname = existing.some((row) => row.type === "CNAME");
    if (hasCname || type === "CNAME") {
      return c.json(
        {
          error:
            "A CNAME cannot share a name with other record types. Remove the other records first.",
        },
        400,
      );
    }
  }

  const duplicate = await db
    .select({ id: dnsRecordsTable.id })
    .from(dnsRecordsTable)
    .where(
      and(
        eq(dnsRecordsTable.zone, zone),
        eq(dnsRecordsTable.name, fqdn),
        eq(dnsRecordsTable.type, type),
        eq(dnsRecordsTable.value, value),
      ),
    );
  if (duplicate.length > 0) {
    return c.json({ error: "Record already exists" }, 409);
  }

  try {
    await ensureZone(zone);
    // The rc.<base> NS delegation is expected to exist in Cloudflare
    // (set up once per base domain). Best-effort here so creating a record
    // never depends on a Cloudflare token — your own nameservers answer it.
    await ensureRecordZoneDelegation(base).catch((error) => {
      console.error(
        `Record zone delegation for ${base} not ready:`,
        error,
      );
    });

    const inserted = await db
      .insert(dnsRecordsTable)
      .values({
        userId: user.id,
        name: fqdn,
        type,
        value,
        ttl,
        zone,
        recordMode: mode,
      })
      .returning();
    const record = inserted[0];
    if (!record) {
      throw new PdnsError(500, "Failed to create record");
    }

    try {
      await publishName(fqdn, zone);
    } catch (publishError) {
      console.error("Failed to publish DNS record:", publishError);
      await db
        .delete(dnsRecordsTable)
        .where(eq(dnsRecordsTable.id, record.id));
      throw publishError;
    }

    return c.json({ record });
  } catch (error) {
    if (error instanceof CfError) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof PdnsError) {
      console.error("Failed to publish DNS record:", error);
      if (error.status >= 400 && error.status < 500) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "Failed to create record" }, 500);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "23505"
    ) {
      return c.json({ error: "Record already exists" }, 409);
    }
    console.error(error);
    return c.json({ error: "Failed to create record" }, 500);
  }
});

recordsRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number.parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid record id" }, 400);
  }

  const found = await db
    .select()
    .from(dnsRecordsTable)
    .where(eq(dnsRecordsTable.id, id));
  const record = found[0];
  if (!record) {
    return c.json({ error: "Record not found" }, 404);
  }
  if (record.userId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    await ensureZone(record.zone);
    await db.delete(dnsRecordsTable).where(eq(dnsRecordsTable.id, id));

    try {
      await publishName(record.name, record.zone);
    } catch (publishError) {
      console.error("Failed to publish DNS record:", publishError);
      await db.insert(dnsRecordsTable).values({
        id: record.id,
        userId: record.userId,
        name: record.name,
        type: record.type,
        value: record.value,
        ttl: record.ttl,
        zone: record.zone,
        recordMode: record.recordMode ?? "dns-only",
        createdAt: record.createdAt,
      });
      if (
        publishError instanceof PdnsError &&
        publishError.status >= 400 &&
        publishError.status < 500
      ) {
        return c.json({ error: publishError.message }, 400);
      }
      return c.json({ error: "Failed to delete record" }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof CfError) {
      return c.json({ error: error.message }, 400);
    }
    console.error(error);
    return c.json({ error: "Failed to delete record" }, 500);
  }
});
