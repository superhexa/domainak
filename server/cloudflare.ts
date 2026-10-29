import {
  CLOUDFLARE_API_TOKEN,
  RECORD_MODE_SUBDOMAIN,
  RECORD_NAMESERVERS,
  RECORD_PROXY_CARRIER,
} from "./config";

// Thin Cloudflare API client for the DNS records feature:
//   * ensureRecordZoneDelegation() delegates `rc.<base>` from each supported
//     base domain to our PowerDNS nameservers (same pattern as the existing
//     records.domainak.qzz.io NS records),
//   * ensureProxyCarrier() keeps the carrier record that proxied answers
//     CNAME to, so resolvers land on Cloudflare's anycast IPs,
//   * upsertProxiedRecord() / removeProxiedRecord() keep the actual proxied
//     record in Cloudflare, which is what the edge uses to route the traffic.
//
// Everything here is cached per process: zone list, delegation state and the
// carrier are cheap to resolve once and never change during a deploy.

const CF_API = "https://api.cloudflare.com/client/v4";

export class CfError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CfError";
    this.status = status;
  }
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
// rc.shortly.z44d.com resolves to the z44d.com zone.
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

const delegatedBases = new Set<string>();

// Publishes the two NS records that delegate `rc.<base>` to our PowerDNS
// nameservers, mirroring the records.domainak.qzz.io delegation. A no-op
// once the records exist.
export async function ensureRecordZoneDelegation(
  base: string,
): Promise<void> {
  const key = base.toLowerCase();
  if (delegatedBases.has(key)) {
    return;
  }

  const owner = RECORD_MODE_SUBDOMAIN
    ? `${RECORD_MODE_SUBDOMAIN}.${key}`
    : key;
  const zone = await zoneFor(owner);
  const existing = await findRecords(zone.id, owner);
  const present = new Set(
    existing
      .filter((record) => record.type === "NS")
      .map((record) => record.content.toLowerCase().replace(/\.$/, "")),
  );

  for (const nameserver of RECORD_NAMESERVERS) {
    const target = nameserver.toLowerCase().replace(/\.$/, "");
    if (present.has(target)) {
      continue;
    }
    await cfFetch(`/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "NS",
        name: owner,
        content: target,
        ttl: 300,
      }),
    });
  }

  delegatedBases.add(key);
}

let carrierReady = false;

// The carrier record every proxied answer CNAMEs to. It must live outside
// every delegated zone (in the parent of the legacy records zone) so it
// resolves through Cloudflare and returns the anycast IPs.
export async function ensureProxyCarrier(): Promise<void> {
  if (carrierReady) {
    return;
  }

  const zone = await zoneFor(RECORD_PROXY_CARRIER);
  const existing = await findRecords(zone.id, RECORD_PROXY_CARRIER);
  const a = existing.find((record) => record.type === "A");

  if (!a) {
    await cfFetch(`/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: RECORD_PROXY_CARRIER,
        content: "192.0.2.1",
        proxied: true,
        ttl: 1,
      }),
    });
  } else if (!a.proxied) {
    await cfFetch(`/zones/${zone.id}/dns_records/${a.id}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "A",
        name: RECORD_PROXY_CARRIER,
        content: a.content,
        proxied: true,
        ttl: 1,
      }),
    });
  }

  carrierReady = true;
}

// Creates or updates the proxied record in Cloudflare for a record the
// user marked as "Proxied". The CF record is what the edge routes on; the
// PowerDNS answer only points resolvers at Cloudflare.
export async function upsertProxiedRecord(
  fqdn: string,
  type: "A" | "AAAA" | "CNAME",
  value: string,
): Promise<void> {
  const zone = await zoneFor(fqdn);
  const existing = await findRecords(zone.id, fqdn);
  const content = type === "CNAME" ? value.replace(/\.$/, "") : value;
  const payload = JSON.stringify({
    type,
    name: fqdn,
    content,
    proxied: true,
    ttl: 1,
  });

  const match = existing.find((record) => record.name === fqdn);
  if (match) {
    await cfFetch(`/zones/${zone.id}/dns_records/${match.id}`, {
      method: "PUT",
      body: payload,
    });
    return;
  }

  await cfFetch(`/zones/${zone.id}/dns_records`, {
    method: "POST",
    body: payload,
  });
}

// Removes the proxied record from Cloudflare (used when a record is
// deleted, so the name stops routing through the edge).
export async function removeProxiedRecord(fqdn: string): Promise<void> {
  const zone = await zoneFor(fqdn);
  const existing = await findRecords(zone.id, fqdn);
  for (const record of existing) {
    await cfFetch(`/zones/${zone.id}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}
