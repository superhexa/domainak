import { CLOUDFLARE_API_TOKEN } from "./config";

// Thin Cloudflare API client for per-domain DNS records: records are
// published as ordinary DNS records in the base domain's Cloudflare
// zone, under the registered subdomain (for example an MX for
// `mail.app.example.com`). DNS-only records only — nothing here hides
// an origin behind Cloudflare's proxy.
//
// Everything is cached per process: the zone list never changes during
// a deploy, so it is resolved once.

const CF_API = "https://api.cloudflare.com/client/v4";

export class CfError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CfError";
    this.status = status;
  }
}

export function cloudflareConfigured(): boolean {
  return Boolean(CLOUDFLARE_API_TOKEN);
}

interface CfZone {
  id: string;
  name: string;
}

interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

function requireToken(): string {
  if (!CLOUDFLARE_API_TOKEN) {
    throw new CfError(
      503,
      "CLOUDFLARE_API_TOKEN is not configured on the server",
    );
  }
  return CLOUDFLARE_API_TOKEN;
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireToken()}`,
      ...init?.headers,
    },
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Fall through to the status-based error below.
  }

  if (!response.ok || body?.success === false) {
    const detail =
      body?.errors?.[0]?.message ||
      `Cloudflare responded ${response.status}`;
    throw new CfError(response.status, `Cloudflare: ${detail}`);
  }
  return body as T;
}

let zonesPromise: Promise<CfZone[]> | null = null;

function listZones(): Promise<CfZone[]> {
  if (!zonesPromise) {
    zonesPromise = cfFetch<{ result: CfZone[] }>(
      "/zones?per_page=50&status=active",
    )
      .then((body) => body.result)
      .catch((error) => {
        zonesPromise = null;
        throw error;
      });
  }
  return zonesPromise;
}

// The CF zone that owns `fqdn`: longest matching suffix wins, so
// `mail.app.example.com` resolves to the example.com zone.
async function zoneFor(fqdn: string): Promise<CfZone> {
  const zones = await listZones();
  const name = fqdn.toLowerCase();
  let best: CfZone | null = null;
  for (const zone of zones) {
    const suffix = `.${zone.name}`;
    if (
      (name === zone.name || name.endsWith(suffix)) &&
      (!best || zone.name.length > best.name.length)
    ) {
      best = zone;
    }
  }
  if (!best) {
    throw new CfError(404, `No Cloudflare zone found for ${fqdn}`);
  }
  return best;
}

async function findRecords(
  zoneId: string,
  name: string,
): Promise<CfDnsRecord[]> {
  const body = await cfFetch<{ result: CfDnsRecord[] }>(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
  );
  return body.result;
}

export interface CloudflareRecordInput {
  type: string;
  name: string;
  content: string;
  ttl: number;
  comment?: string | null;
}

function recordPayload(input: CloudflareRecordInput): string {
  return JSON.stringify({
    type: input.type,
    name: input.name,
    content: input.content,
    ttl: input.ttl,
    proxied: false,
    ...(input.comment ? { comment: input.comment } : {}),
  });
}

// Creates the record in Cloudflare, or updates/adopts the matching one
// when it already exists (for example a record left behind by an older
// row). Returns the Cloudflare record id.
export async function upsertCloudflareRecord(
  input: CloudflareRecordInput,
  existingId?: string | null,
): Promise<string> {
  const zone = await zoneFor(input.name);
  const payload = recordPayload(input);

  if (existingId) {
    try {
      await cfFetch(`/zones/${zone.id}/dns_records/${existingId}`, {
        method: "PUT",
        body: payload,
      });
      return existingId;
    } catch (error) {
      if (!(error instanceof CfError) || error.status !== 404) {
        throw error;
      }
      // The stored id is gone in Cloudflare; fall through and recreate.
    }
  }

  const existing = await findRecords(zone.id, input.name);
  const sameType = existing.filter(
    (record) =>
      record.type === input.type &&
      record.name.toLowerCase() === input.name.toLowerCase(),
  );
  const identical = sameType.find(
    (record) => record.content === input.content,
  );
  if (identical) {
    await cfFetch(`/zones/${zone.id}/dns_records/${identical.id}`, {
      method: "PUT",
      body: payload,
    });
    return identical.id;
  }
  if (sameType[0]) {
    await cfFetch(`/zones/${zone.id}/dns_records/${sameType[0].id}`, {
      method: "PUT",
      body: payload,
    });
    return sameType[0].id;
  }

  const created = await cfFetch<{ result: CfDnsRecord }>(
    `/zones/${zone.id}/dns_records`,
    { method: "POST", body: payload },
  );
  return created.result.id;
}

// Removes a published record. A missing zone or a missing record id
// means there is nothing left to remove, so those are swallowed; any
// other Cloudflare failure is thrown so the caller can keep the row.
export async function removeCloudflareRecord(
  name: string,
  type: string,
  cloudflareId: string | null,
  content?: string,
): Promise<void> {
  let zone: CfZone;
  try {
    zone = await zoneFor(name);
  } catch (error) {
    if (error instanceof CfError && error.status === 404) {
      return;
    }
    throw error;
  }

  if (cloudflareId) {
    try {
      await cfFetch(`/zones/${zone.id}/dns_records/${cloudflareId}`, {
        method: "DELETE",
      });
      return;
    } catch (error) {
      if (!(error instanceof CfError) || error.status !== 404) {
        throw error;
      }
      // Fall through to the name-based cleanup below.
    }
  }

  const existing = await findRecords(zone.id, name);
  for (const record of existing) {
    if (
      record.type !== type ||
      record.name.toLowerCase() !== name.toLowerCase() ||
      (content !== undefined && record.content !== content)
    ) {
      continue;
    }
    await cfFetch(`/zones/${zone.id}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}
