import { and, asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import {
  CfError,
  cloudflareConfigured,
  removeCloudflareRecord,
  upsertCloudflareRecord,
} from "../cloudflare";
import { db } from "../db";
import {
  bannedDomainsTable,
  bannedIpsTable,
  domainDnsRecordsTable,
  domainTable,
} from "../db/schema";
import {
  cnameConflictError,
  type DnsRecordType,
  isDnsRecordType,
  recordTargetHost,
  resolveRecordName,
  validateRecordValue,
  validateTtl,
} from "../dns-validation";

// DNS records for one registered domain, managed from that domain's
// settings. Records live under the domain itself (@ is the domain,
// "www" is www.<domain>) and are published as ordinary DNS records in
// the base domain's Cloudflare zone. Postgres is the source of truth:
// a record is always saved, and syncStatus reports whether Cloudflare
// holds the same copy, so a missing token or a Cloudflare outage never
// silently loses a record — it stays "pending"/"failed" with a Retry.

type RecordRow = typeof domainDnsRecordsTable.$inferSelect;

type PublicRecord = Omit<RecordRow, "cloudflareId">;

function toPublicRecord(row: RecordRow): PublicRecord {
  const { cloudflareId: _cloudflareId, ...rest } = row;
  return rest;
}

type DomainRow = typeof domainTable.$inferSelect;

async function loadDomain(
  c: Context,
  id: number,
): Promise<DomainRow | null> {
  const user = c.get("user");
  const found = await db
    .select()
    .from(domainTable)
    .where(eq(domainTable.id, id));
  const domain = found[0];
  if (!domain) {
    return null;
  }
  if (domain.userId !== user.id && !user.isAdmin) {
    return null;
  }
  return domain;
}

async function findBannedError(
  name: string,
  type: DnsRecordType,
  value: string,
): Promise<string | null> {
  const bannedDomain = await db
    .select({ id: bannedDomainsTable.id })
    .from(bannedDomainsTable)
    .where(eq(bannedDomainsTable.domain, name));
  if (bannedDomain.length > 0) {
    return "Domain is banned";
  }

  const target = recordTargetHost(type, value);
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

interface ParsedRecordInput {
  fqdn: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
  comment: string | null;
}

async function parseRecordInput(
  body: Record<string, unknown>,
  domain: DomainRow,
): Promise<ParsedRecordInput | { error: string }> {
  const type = String(body.type ?? "").toUpperCase();
  if (!isDnsRecordType(type)) {
    return {
      error:
        "Type must be one of: A, AAAA, CNAME, TXT, MX, NS, " +
        "SRV, CAA, PTR, DS, HTTPS, SVCB, CERT, SSHFP, TLSA, NAPTR",
    };
  }

  const ttlResult = validateTtl(body.ttl);
  if (!ttlResult.ok) {
    return { error: ttlResult.error };
  }

  const nameResult = resolveRecordName(domain.subdomain, body.name);
  if (!nameResult.ok) {
    return { error: nameResult.error };
  }

  const valueResult = validateRecordValue(type, body.value);
  if (!valueResult.ok) {
    return { error: valueResult.error };
  }

  const comment = String(body.comment ?? "").trim();
  if (comment.length > 255) {
    return { error: "Comment must be at most 255 characters" };
  }

  return {
    fqdn: nameResult.value.fqdn,
    type,
    value: valueResult.value,
    ttl: ttlResult.value,
    comment: comment || null,
  };
}

function syncErrorMessage(error: unknown): string {
  if (error instanceof CfError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to publish the record";
}

// Publishes one row's values and returns the Cloudflare record id, or
// null when publishing is not configured. Throws on Cloudflare errors.
async function publishRecord(
  record: Pick<
    RecordRow,
    "name" | "type" | "value" | "ttl" | "comment" | "cloudflareId"
  >,
): Promise<string | null> {
  if (!cloudflareConfigured()) {
    return null;
  }
  return upsertCloudflareRecord(
    {
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: record.ttl,
      comment: record.comment,
    },
    record.cloudflareId,
  );
}

async function markPublishState(
  id: number,
  outcome:
    | { status: "synced"; cloudflareId: string | null }
    | { status: "pending" | "failed"; error: string },
): Promise<RecordRow | undefined> {
  const updated = await db
    .update(domainDnsRecordsTable)
    .set(
      outcome.status === "synced"
        ? {
            syncStatus: "synced",
            cloudflareId: outcome.cloudflareId,
            syncError: null,
          }
        : {
            syncStatus: outcome.status,
            syncError: outcome.error,
          },
    )
    .where(eq(domainDnsRecordsTable.id, id))
    .returning();
  return updated[0];
}

function notConfiguredError(): string {
  return (
    "Not published: CLOUDFLARE_API_TOKEN is not configured " +
    "on the server. The record is saved and will publish " +
    "once the token is set."
  );
}

export async function listDomainRecords(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid domain id" }, 400);
  }
  const domain = await loadDomain(c, id);
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const rows = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(eq(domainDnsRecordsTable.domainId, id))
    .orderBy(
      asc(domainDnsRecordsTable.name),
      asc(domainDnsRecordsTable.type),
      asc(domainDnsRecordsTable.id),
    );

  return c.json({
    domain: domain.subdomain,
    dnsConfigured: cloudflareConfigured(),
    records: rows.map(toPublicRecord),
  });
}

export async function createDomainRecord(c: Context) {
  const user = c.get("user");
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid domain id" }, 400);
  }
  const domain = await loadDomain(c, id);
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const parsed = await parseRecordInput(await c.req.json(), domain);
  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
  }

  const banned = await findBannedError(
    parsed.fqdn,
    parsed.type,
    parsed.value,
  );
  if (banned) {
    return c.json({ error: banned }, 403);
  }

  const siblings = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(
      and(
        eq(domainDnsRecordsTable.domainId, id),
        eq(domainDnsRecordsTable.name, parsed.fqdn),
      ),
    );

  const conflict = cnameConflictError(siblings, parsed.type);
  if (conflict) {
    return c.json({ error: conflict }, 400);
  }

  const duplicate = siblings.some(
    (row) => row.type === parsed.type && row.value === parsed.value,
  );
  if (duplicate) {
    return c.json({ error: "Record already exists" }, 409);
  }

  const inserted = await db
    .insert(domainDnsRecordsTable)
    .values({
      domainId: id,
      userId: user.id,
      name: parsed.fqdn,
      type: parsed.type,
      value: parsed.value,
      ttl: parsed.ttl,
      comment: parsed.comment,
      syncStatus: "pending",
    })
    .returning();
  const record = inserted[0];
  if (!record) {
    return c.json({ error: "Failed to create record" }, 500);
  }

  if (!cloudflareConfigured()) {
    const saved = await markPublishState(record.id, {
      status: "pending",
      error: notConfiguredError(),
    });
    return c.json({ record: toPublicRecord(saved ?? record) }, 201);
  }

  try {
    const cloudflareId = await publishRecord(record);
    const saved = await markPublishState(record.id, {
      status: "synced",
      cloudflareId,
    });
    return c.json({ record: toPublicRecord(saved ?? record) }, 201);
  } catch (error) {
    const saved = await markPublishState(record.id, {
      status: "failed",
      error: syncErrorMessage(error),
    });
    return c.json({ record: toPublicRecord(saved ?? record) }, 201);
  }
}

export async function updateDomainRecord(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  const recordId = Number.parseInt(c.req.param("recordId") ?? "", 10);
  if (Number.isNaN(id) || Number.isNaN(recordId)) {
    return c.json({ error: "Invalid id" }, 400);
  }
  const domain = await loadDomain(c, id);
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const found = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(
      and(
        eq(domainDnsRecordsTable.id, recordId),
        eq(domainDnsRecordsTable.domainId, id),
      ),
    );
  const existing = found[0];
  if (!existing) {
    return c.json({ error: "Record not found" }, 404);
  }

  const parsed = await parseRecordInput(await c.req.json(), domain);
  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
  }

  const banned = await findBannedError(
    parsed.fqdn,
    parsed.type,
    parsed.value,
  );
  if (banned) {
    return c.json({ error: banned }, 403);
  }

  const siblings = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(
      and(
        eq(domainDnsRecordsTable.domainId, id),
        eq(domainDnsRecordsTable.name, parsed.fqdn),
      ),
    );

  const conflict = cnameConflictError(siblings, parsed.type, recordId);
  if (conflict) {
    return c.json({ error: conflict }, 400);
  }

  const duplicate = siblings.some(
    (row) =>
      row.id !== recordId &&
      row.type === parsed.type &&
      row.value === parsed.value,
  );
  if (duplicate) {
    return c.json({ error: "Record already exists" }, 409);
  }

  const unchanged =
    existing.name === parsed.fqdn &&
    existing.type === parsed.type &&
    existing.value === parsed.value &&
    existing.ttl === parsed.ttl &&
    (existing.comment ?? null) === parsed.comment;

  // Publish the new values first: if Cloudflare rejects them, the
  // stored row keeps describing what actually resolves.
  if (!unchanged) {
    if (!cloudflareConfigured()) {
      return c.json({ error: notConfiguredError() }, 503);
    }
    try {
      const cloudflareId = await publishRecord({
        ...existing,
        name: parsed.fqdn,
        type: parsed.type,
        value: parsed.value,
        ttl: parsed.ttl,
        comment: parsed.comment,
      });
      const updated = await db
        .update(domainDnsRecordsTable)
        .set({
          name: parsed.fqdn,
          type: parsed.type,
          value: parsed.value,
          ttl: parsed.ttl,
          comment: parsed.comment,
          syncStatus: "synced",
          cloudflareId,
          syncError: null,
        })
        .where(eq(domainDnsRecordsTable.id, recordId))
        .returning();
      const saved = updated[0];
      if (!saved) {
        return c.json({ error: "Failed to update record" }, 500);
      }
      return c.json({ record: toPublicRecord(saved) });
    } catch (error) {
      return c.json({ error: syncErrorMessage(error) }, 500);
    }
  }

  // Nothing changed except possibly a retry of a failed publish.
  if (existing.syncStatus !== "synced" && cloudflareConfigured()) {
    try {
      const cloudflareId = await publishRecord(existing);
      const updated = await db
        .update(domainDnsRecordsTable)
        .set({
          syncStatus: "synced",
          cloudflareId,
          syncError: null,
        })
        .where(eq(domainDnsRecordsTable.id, recordId))
        .returning();
      const saved = updated[0];
      if (saved) {
        return c.json({ record: toPublicRecord(saved) });
      }
    } catch (error) {
      return c.json({ error: syncErrorMessage(error) }, 500);
    }
  }

  return c.json({ record: toPublicRecord(existing) });
}

export async function deleteDomainRecord(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  const recordId = Number.parseInt(c.req.param("recordId") ?? "", 10);
  if (Number.isNaN(id) || Number.isNaN(recordId)) {
    return c.json({ error: "Invalid id" }, 400);
  }
  const domain = await loadDomain(c, id);
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const found = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(
      and(
        eq(domainDnsRecordsTable.id, recordId),
        eq(domainDnsRecordsTable.domainId, id),
      ),
    );
  const record = found[0];
  if (!record) {
    return c.json({ error: "Record not found" }, 404);
  }

  // Only a record that was actually published needs unpublishing; a
  // pending/failed row never reached Cloudflare.
  if (record.cloudflareId || record.syncStatus === "synced") {
    try {
      await removeCloudflareRecord(
        record.name,
        record.type,
        record.cloudflareId,
        record.value,
      );
    } catch (error) {
      return c.json({ error: syncErrorMessage(error) }, 500);
    }
  }

  await db
    .delete(domainDnsRecordsTable)
    .where(eq(domainDnsRecordsTable.id, recordId));
  return c.json({ success: true });
}

export async function retryDomainRecord(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  const recordId = Number.parseInt(c.req.param("recordId") ?? "", 10);
  if (Number.isNaN(id) || Number.isNaN(recordId)) {
    return c.json({ error: "Invalid id" }, 400);
  }
  const domain = await loadDomain(c, id);
  if (!domain) {
    return c.json({ error: "Domain not found" }, 404);
  }

  const found = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(
      and(
        eq(domainDnsRecordsTable.id, recordId),
        eq(domainDnsRecordsTable.domainId, id),
      ),
    );
  const record = found[0];
  if (!record) {
    return c.json({ error: "Record not found" }, 404);
  }

  if (!cloudflareConfigured()) {
    const saved = await markPublishState(record.id, {
      status: "pending",
      error: notConfiguredError(),
    });
    return c.json({ record: toPublicRecord(saved ?? record) });
  }

  try {
    const cloudflareId = await publishRecord(record);
    const saved = await markPublishState(record.id, {
      status: "synced",
      cloudflareId,
    });
    return c.json({ record: toPublicRecord(saved ?? record) });
  } catch (error) {
    const saved = await markPublishState(record.id, {
      status: "failed",
      error: syncErrorMessage(error),
    });
    return c.json({ record: toPublicRecord(saved ?? record) });
  }
}

// Removes every published record of a domain from Cloudflare and then
// its rows, best-effort: a Cloudflare failure is logged, never thrown,
// so deleting or banning a domain can never be blocked by DNS cleanup.
// Callers still delete the domain row itself afterwards.
export async function removeDomainDnsRecords(
  domainId: number,
): Promise<void> {
  const rows = await db
    .select()
    .from(domainDnsRecordsTable)
    .where(eq(domainDnsRecordsTable.domainId, domainId));
  for (const row of rows) {
    if (!row.cloudflareId && row.syncStatus !== "synced") {
      continue;
    }
    try {
      await removeCloudflareRecord(
        row.name,
        row.type,
        row.cloudflareId,
        row.value,
      );
    } catch (error) {
      console.error(
        `Failed to remove DNS record ${row.name} ${row.type}:`,
        error,
      );
    }
  }
  await db
    .delete(domainDnsRecordsTable)
    .where(eq(domainDnsRecordsTable.domainId, domainId));
}
