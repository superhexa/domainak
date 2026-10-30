export interface User {
  id: number;
  name: string;
  email: string;
  githubId: number;
  isAdmin: boolean;
  isBanned: boolean;
}

// Country policy of a route: "all" lets every country through, while
// "allowlist" serves only the selected countries and "blocklist" serves
// every country except them.
export type GeoMode = "all" | "allowlist" | "blocklist";

// Server-computed view of a route's service window. The local wall-clock
// range is what the owner configured; the UTC bounds and the offset label are
// derived on the server from the IANA timezone, so the client never has to
// trust its own clock for the authoritative conversion.
export interface ServiceWindow {
  timezone: string;
  start: string;
  end: string;
  offsetMinutes: number;
  offsetLabel: string;
  utcStart: string;
  utcEnd: string;
}

// Payload of PUT /domains/:id/settings. Country codes are stored as the
// two-letter values the edge proxy compares against CF-IPCountry. Declared as
// a type alias so it can be passed straight to the JSON body helpers.
export type DomainRulesPayload = {
  geoMode: GeoMode;
  countries: string[];
  maintenance: boolean;
  maintenanceMessage: string;
  serviceHours: boolean;
  timezone: string;
  start: string;
  end: string;
};

export interface Domain {
  id: number;
  subdomain: string;
  hostname: string | null;
  port: number | null;
  targetUrl?: string | null;
  mode?: "proxy" | "redirect";
  geoMode?: GeoMode;
  geoCountries?: string[];
  maintenance?: boolean;
  maintenanceMessage?: string | null;
  serviceHours?: boolean;
  timezone?: string;
  serviceStart?: string;
  serviceEnd?: string;
  serviceWindow?: ServiceWindow | null;
  createdAt?: string;
  user?: User | null;
}

// DNS records (A, AAAA, CNAME, TXT) served from the delegated zone that
// domainak runs itself, so they are not limited by Cloudflare record quotas.
export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";

// "dns-only" answers with the real value straight from PowerDNS;
// "proxied" hides the origin behind Cloudflare, like the orange cloud.
export type DnsRecordMode = "dns-only" | "proxied";

// A base domain where records can be created. `zone` is what the record
// names resolve inside, e.g. tgram.rc.domainak.qzz.io lives in
// rc.domainak.qzz.io.
export interface RecordDomain {
  domain: string;
  zone: string;
}

export interface DnsRecord {
  id: number;
  userId: number;
  // Fully qualified name without a trailing dot, e.g.
  // "tgram.rc.domainak.qzz.io".
  name: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
  // PowerDNS zone that answers this record, e.g. "rc.domainak.qzz.io".
  zone: string;
  recordMode: DnsRecordMode;
  createdAt?: string;
  // Admin-only: the owner of the record, populated on admin list endpoints.
  user?: {
    id: number;
    name: string;
    email: string;
    githubId: number;
    isBanned: boolean;
  } | null;
}

// Payload of GET /records: the user's records plus the base domains that
// support record mode.
export interface RecordsResponse {
  records: DnsRecord[];
  domains: RecordDomain[];
}

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  githubId: number;
  isBanned: boolean;
  domainCount: number;
}

export interface BannedDomain {
  id: number;
  domain: string;
  reason: string | null;
  createdAt: string;
}

export interface BannedIp {
  id: number;
  ip: string;
  reason: string | null;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface Stats {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
  chartData: { name: string; visitors: number }[];
}
