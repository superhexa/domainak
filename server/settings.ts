import { eq } from "drizzle-orm";
import { db } from "./db";
import { redis } from "./db/redis";
import { domainTable } from "./db/schema";

// Per-subdomain access rules. The rows live in the `domain` table, while the
// edge proxy (unregistered.lua) reads the compact JSON published to
// `<host>:settings` in redis. Keeping a separate redis key means the routing
// value keeps its historical plain format, and `deleteDomainRoute()` already
// sweeps `<host>:*` when a route disappears.

export type GeoMode = "all" | "allowlist" | "blocklist";

export interface DomainRuleSettings {
  geoMode: GeoMode;
  geoCountries: string[];
  maintenance: boolean;
  maintenanceMessage: string | null;
  serviceHours: boolean;
  timezone: string;
  serviceStart: string;
  serviceEnd: string;
}

// Server-side view of a service window: the local wall-clock range plus its
// current conversion to GMT, used by the dashboard and by the block page.
export interface ServiceWindow {
  timezone: string;
  start: string;
  end: string;
  offsetMinutes: number;
  offsetLabel: string;
  utcStart: string;
  utcEnd: string;
}

type SettingsParseResult =
  | { settings: DomainRuleSettings }
  | { error: string };

const GEO_MODES: readonly string[] = ["all", "allowlist", "blocklist"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_PATTERN = /^(24:00|([01]\d|2[0-3]):[0-5]\d)$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const MAX_COUNTRIES = 250;
const MAX_MAINTENANCE_MESSAGE = 200;
const MINUTES_PER_DAY = 1440;

// Current UTC offset of an IANA timezone in minutes (local = UTC + offset),
// derived from Intl so daylight saving time is applied automatically.
export function timezoneOffsetMinutes(
  timezone: string,
  at: Date = new Date(),
): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    parts[part.type] = part.value;
  }

  const asUtc = Date.UTC(
    Number(parts.year ?? 0),
    Number(parts.month ?? 1) - 1,
    Number(parts.day ?? 1),
    Number(parts.hour ?? 0),
    Number(parts.minute ?? 0),
    Number(parts.second ?? 0),
  );

  return Math.round((asUtc - at.getTime()) / 60000);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "UTC";
  }
  return isValidTimezone(trimmed) ? trimmed : "UTC";
}

// "HH:MM" -> minutes since local midnight; "24:00" maps to 1440.
export function timeToMinutes(value: string): number | null {
  if (!END_TIME_PATTERN.test(value)) {
    return null;
  }
  if (value === "24:00") {
    return MINUTES_PER_DAY;
  }
  const [hours, minutes] = value.split(":");
  const parsedHours = Number.parseInt(hours ?? "", 10);
  const parsedMinutes = Number.parseInt(minutes ?? "", 10);
  if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) {
    return null;
  }
  return parsedHours * 60 + parsedMinutes;
}

function formatMinutes(value: number): string {
  const normalized = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Builds the GMT view of a service window: converted bounds plus the offset
// label for display. Returns null when the route has no schedule.
export function serviceWindowMeta(row: {
  serviceHours?: boolean | null;
  timezone?: string | null;
  serviceStart?: string | null;
  serviceEnd?: string | null;
}): ServiceWindow | null {
  if (!row.serviceHours) {
    return null;
  }

  const timezone = normalizeTimezone(row.timezone ?? "UTC");
  const rawStart = row.serviceStart ?? "00:00";
  const rawEnd = row.serviceEnd ?? "24:00";
  const start = TIME_PATTERN.test(rawStart) ? rawStart : "00:00";
  const end = END_TIME_PATTERN.test(rawEnd) ? rawEnd : "24:00";

  let offsetMinutes = 0;
  try {
    offsetMinutes = timezoneOffsetMinutes(timezone);
  } catch {
    offsetMinutes = 0;
  }

  const startMinutes = timeToMinutes(start) ?? 0;
  const endMinutes = timeToMinutes(end) ?? MINUTES_PER_DAY;

  return {
    timezone,
    start,
    end,
    offsetMinutes,
    offsetLabel: formatOffsetLabel(offsetMinutes),
    utcStart: formatMinutes(startMinutes - offsetMinutes),
    utcEnd: formatMinutes(endMinutes - offsetMinutes),
  };
}

// Validates and normalizes the settings payload of PUT /domains/:id/settings.
export function parseSettingsInput(
  input: Record<string, unknown>,
): SettingsParseResult {
  const geoMode = input.geoMode ?? "all";
  if (typeof geoMode !== "string" || !GEO_MODES.includes(geoMode)) {
    return { error: "Invalid country rule" };
  }
  const mode = geoMode as GeoMode;

  const rawCountries = Array.isArray(input.countries) ? input.countries : [];
  const countries: string[] = [];
  for (const entry of rawCountries) {
    const code = String(entry ?? "").trim().toUpperCase();
    if (!code) {
      continue;
    }
    if (!COUNTRY_PATTERN.test(code)) {
      return { error: `Invalid country code: ${code}` };
    }
    if (!countries.includes(code)) {
      countries.push(code);
    }
  }
  if (countries.length > MAX_COUNTRIES) {
    return { error: "Too many countries selected" };
  }
  if (mode !== "all" && countries.length === 0) {
    return { error: "Select at least one country" };
  }

  const maintenance = input.maintenance === true;
  const rawMessage = String(input.maintenanceMessage ?? "").trim();
  if (rawMessage.length > MAX_MAINTENANCE_MESSAGE) {
    return {
      error: `Maintenance message must be ${MAX_MAINTENANCE_MESSAGE} characters or fewer`,
    };
  }
  const maintenanceMessage = maintenance && rawMessage ? rawMessage : null;

  const serviceHours = input.serviceHours === true;
  const rawTimezone = String(input.timezone ?? "").trim();
  if (rawTimezone && !isValidTimezone(rawTimezone)) {
    return { error: "Invalid time zone" };
  }
  const timezone = normalizeTimezone(rawTimezone);

  const start = String(input.start ?? "00:00").trim();
  const end = String(input.end ?? "24:00").trim();
  if (!TIME_PATTERN.test(start)) {
    return { error: "Invalid service start time" };
  }
  if (!END_TIME_PATTERN.test(end)) {
    return { error: "Invalid service end time" };
  }
  if (serviceHours && start === end) {
    return {
      error: "Start and end times must differ, or use around the clock",
    };
  }

  return {
    settings: {
      geoMode: mode,
      geoCountries: countries,
      maintenance,
      maintenanceMessage,
      serviceHours,
      timezone,
      serviceStart: start,
      serviceEnd: end,
    },
  };
}

// Compact JSON consumed by the edge proxy. Returns null when no rule is
// active so the redis key can be dropped entirely and the proxy skips the
// settings lookup path for that host... well, it still caches the "absent"
// sentinel, but no policy is ever evaluated.
export function buildSettingsPayload(
  settings: DomainRuleSettings,
): string | null {
  const geoActive =
    settings.geoMode !== "all" && settings.geoCountries.length > 0;

  if (!settings.maintenance && !geoActive && !settings.serviceHours) {
    return null;
  }

  const payload: Record<string, unknown> = {};

  if (geoActive) {
    payload.geo = settings.geoMode;
    payload.cc = settings.geoCountries;
  }

  if (settings.maintenance) {
    payload.mm = 1;
    if (settings.maintenanceMessage) {
      payload.mmsg = settings.maintenanceMessage;
    }
  }

  if (settings.serviceHours) {
    const window = serviceWindowMeta({
      serviceHours: true,
      timezone: settings.timezone,
      serviceStart: settings.serviceStart,
      serviceEnd: settings.serviceEnd,
    });
    const startMinutes = timeToMinutes(settings.serviceStart) ?? 0;
    const endMinutes =
      timeToMinutes(settings.serviceEnd) ?? MINUTES_PER_DAY;

    payload.sh = 1;
    payload.off = window?.offsetMinutes ?? 0;
    payload.s = startMinutes;
    payload.e = endMinutes;
    if (window) {
      payload.win =
        `${window.start}-${window.end} (${window.offsetLabel})` +
        ` - GMT ${window.utcStart}-${window.utcEnd}`;
    }
  }

  return JSON.stringify(payload);
}

// Publishes (or removes) the `<host>:settings` redis key. The proxy caches
// it for 30 seconds, the same staleness window as the routing value.
export async function publishDomainSettings(
  subdomain: string,
  settings: DomainRuleSettings,
): Promise<void> {
  const key = `${subdomain}:settings`;
  const payload = buildSettingsPayload(settings);
  if (payload === null) {
    await redis.del(key);
    return;
  }
  await redis.set(key, payload);
}

// The stored UTC offset drifts when a timezone crosses a DST transition, so
// every route with an active service window gets its payload rewritten on a
// timer. "XX" keeps the write conditional: a key removed because the owner
// disabled all rules must never be resurrected by a stale row read.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

async function refreshServiceWindows(): Promise<void> {
  const rows = await db
    .select()
    .from(domainTable)
    .where(eq(domainTable.serviceHours, true));

  for (const row of rows) {
    const payload = buildSettingsPayload(row);
    if (payload === null) {
      continue;
    }
    await redis.set(`${row.subdomain}:settings`, payload, "XX");
  }
}

export function startSettingsRefresher(): () => void {
  const run = () => {
    refreshServiceWindows().catch((error) => {
      console.error("Failed to refresh service window offsets:", error);
    });
  };

  run();
  const timer = setInterval(run, REFRESH_INTERVAL_MS);
  return () => clearInterval(timer);
}
