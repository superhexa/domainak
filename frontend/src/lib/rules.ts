// Client-side helpers for the per-route access rules. They mirror the server
// implementation in `server/settings.ts` (and the edge evaluator in
// unregistered.lua) so the dashboard can preview a draft window instantly.
// The server stays the source of truth: whatever it returns in
// `serviceWindow` is what the dashboard displays as authoritative.
import { getUserLocale } from "./utils";

const MINUTES_PER_DAY = 1440;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_PATTERN = /^(24:00|([01]\d|2[0-3]):[0-5]\d)$/;

let cachedTimezones: string[] | null = null;

// IANA timezone names for the picker. Intl.supportedValuesOf carries the full
// list on modern browsers; the fallback keeps the field usable on older ones
// where the API is missing.
export function listTimezones(): string[] {
  if (cachedTimezones) {
    return cachedTimezones;
  }

  const supportedValuesOf = (
    Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }
  ).supportedValuesOf;

  let zones: string[] = [];
  if (typeof supportedValuesOf === "function") {
    try {
      zones = supportedValuesOf("timeZone");
    } catch {
      zones = [];
    }
  }

  if (zones.length === 0) {
    zones = [
      "UTC",
      "Africa/Cairo",
      "Africa/Johannesburg",
      "America/Chicago",
      "America/Los_Angeles",
      "America/New_York",
      "America/Sao_Paulo",
      "Asia/Dhaka",
      "Asia/Dubai",
      "Asia/Karachi",
      "Asia/Kolkata",
      "Asia/Riyadh",
      "Asia/Shanghai",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Australia/Sydney",
      "Europe/Berlin",
      "Europe/Istanbul",
      "Europe/London",
      "Europe/Madrid",
      "Europe/Moscow",
      "Europe/Paris",
      "Pacific/Auckland",
    ];
  }

  if (!zones.includes("UTC")) {
    zones = ["UTC", ...zones];
  }

  cachedTimezones = zones;
  return cachedTimezones;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Current UTC offset of a timezone in minutes (local = UTC + offset). Derived
// through Intl so daylight saving time is applied for the given instant.
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

export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(
    minutes,
  ).padStart(2, "0")}`;
}

// "HH:MM" -> minutes since midnight. "24:00" (a whole-day end bound) is 1440.
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

export function isValidStart(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidEnd(value: string): boolean {
  return END_TIME_PATTERN.test(value);
}

// Formats minutes-since-midnight back into "HH:MM", wrapping past midnight so
// a local window can be expressed in GMT even when it crosses a date boundary.
export function minutesToLabel(value: number): string {
  const normalized =
    ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export interface GmtWindow {
  utcStart: string;
  utcEnd: string;
  offsetLabel: string;
  offsetMinutes: number;
}

// Converts a local wall-clock window into GMT using the timezone's current
// offset — the same conversion the server performs and publishes.
export function gmtWindow(
  start: string,
  end: string,
  timezone: string,
  at: Date = new Date(),
): GmtWindow {
  const offsetMinutes = timezoneOffsetMinutes(timezone, at);
  const startMinutes = timeToMinutes(start) ?? 0;
  const endMinutes = timeToMinutes(end) ?? MINUTES_PER_DAY;

  return {
    utcStart: minutesToLabel(startMinutes - offsetMinutes),
    utcEnd: minutesToLabel(endMinutes - offsetMinutes),
    offsetLabel: formatOffsetLabel(offsetMinutes),
    offsetMinutes,
  };
}

export interface WindowEvaluation {
  open: boolean;
  localMinutes: number;
  // Minutes until the window next opens; 0 while it is open.
  waitMinutes: number;
}

// Mirrors the edge evaluator: an equal start/end means around the clock, a
// start before the end is a same-day window, and a start after the end is an
// overnight window.
export function evaluateWindow(
  start: string,
  end: string,
  timezone: string,
  at: Date = new Date(),
): WindowEvaluation {
  const offsetMinutes = timezoneOffsetMinutes(timezone, at);
  const utcMinutes = Math.floor((at.getTime() / 60000) % MINUTES_PER_DAY);
  const localMinutes =
    ((utcMinutes + offsetMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;

  const startMinutes = timeToMinutes(start) ?? 0;
  const endMinutes = timeToMinutes(end) ?? MINUTES_PER_DAY;

  let open: boolean;
  if (startMinutes === endMinutes) {
    open = true;
  } else if (startMinutes < endMinutes) {
    open = localMinutes >= startMinutes && localMinutes < endMinutes;
  } else {
    open = localMinutes >= startMinutes || localMinutes < endMinutes;
  }

  let waitMinutes = 0;
  if (!open) {
    waitMinutes = (startMinutes - localMinutes) % MINUTES_PER_DAY;
    if (waitMinutes === 0) {
      waitMinutes = 60;
    }
  }

  return { open, localMinutes, waitMinutes };
}

export function formatClockInZone(
  at: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "medium",
  },
): string {
  const safeZone = isValidTimezone(timezone) ? timezone : "UTC";
  try {
    return new Intl.DateTimeFormat(getUserLocale(), {
      timeZone: safeZone,
      ...options,
    }).format(at);
  } catch {
    return at.toISOString();
  }
}

// "4h 12m" style countdown for the service-window preview.
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}
