/**
 * Presentation formatters shared by server and client components.
 *
 * One implementation each, so a status that reads "Login Success" in the activity table
 * reads the same in the admin audit table, and so a timestamp is never rendered as a raw
 * ISO string anywhere in the console. Nothing here touches the network or the clock
 * unless a `now` is passed in: relative time is computed from a caller-supplied instant
 * so server and client renders cannot disagree.
 */

const ACRONYMS = new Set([
  "api",
  "cors",
  "csv",
  "http",
  "https",
  "id",
  "ip",
  "json",
  "mfa",
  "otp",
  "qr",
  "sso",
  "totp",
  "ttl",
  "url",
  "uuid",
]);

/** `session.heartbeat` → "Session Heartbeat", `mfa_challenge` → "MFA Challenge". */
export function formatLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .split(/[-_.:\s]+/u)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

/** Sentence-case variant for prose: `missing-in-database` → "Missing in database". */
export function formatSentence(value: string | null | undefined): string {
  const words = String(value ?? "")
    .split(/[-_.:\s]+/u)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return ACRONYMS.has(lower) ? lower.toUpperCase() : lower;
    });
  if (words.length === 0) return "";
  const [first, ...rest] = words;
  const head = ACRONYMS.has(first!.toLowerCase())
    ? first!
    : `${first!.charAt(0).toUpperCase()}${first!.slice(1)}`;
  return [head, ...rest].join(" ");
}

const NUMBER_FORMAT = new Intl.NumberFormat("en");

export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? NUMBER_FORMAT.format(value)
    : "Not available";
}

export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${formatNumber(count)} ${count === 1 ? noun : plural}`;
}

/** 16384 → "16 KB", 1_048_576 → "1 MB". Binary units, at most one decimal. */
export function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Not available";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** 8 → "8 s", 180 → "3 min", 3600 → "1 h", 86400 → "1 day", 1209600 → "14 days". */
export function formatDurationSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Not available";
  const seconds = Math.round(value);
  if (seconds >= 86_400 && seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (seconds >= 3_600) return `${Math.round((seconds / 3_600) * 10) / 10} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export type FormattedDateTime = {
  iso: string;
  absolute: string;
  relative: string;
  valid: boolean;
};

// Assembled by hand rather than through Intl so the output cannot drift between ICU
// builds ("Sep" vs "Sept") or between the server and the browser.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function absoluteDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function absoluteDateTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${absoluteDate(date)}, ${hours}:${minutes} UTC`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function relativeTo(timestamp: number, now: number): string {
  const delta = timestamp - now;
  const magnitude = Math.abs(delta);
  if (magnitude < 45_000) return "just now";
  for (const [unit, size] of RELATIVE_UNITS) {
    if (magnitude >= size) return RELATIVE.format(Math.round(delta / size), unit);
  }
  return RELATIVE.format(Math.round(delta / 60_000), "minute");
}

/**
 * Parse an ISO-ish timestamp once and hand back every rendering the console uses.
 * `absolute` is always UTC and always the same string on the server and the client;
 * `relative` is only meaningful when `now` is supplied by the caller.
 */
export function formatDateTime(
  value: string | null | undefined,
  options: { now?: number | undefined; style?: "date" | "datetime" | undefined } = {},
): FormattedDateTime {
  const raw = String(value ?? "").trim();
  const timestamp = raw ? Date.parse(raw) : Number.NaN;
  if (!raw || Number.isNaN(timestamp)) {
    return { iso: "", absolute: "", relative: "", valid: false };
  }
  const date = new Date(timestamp);
  const absolute = options.style === "date" ? absoluteDate(date) : absoluteDateTime(date);
  return {
    iso: date.toISOString(),
    absolute,
    relative: typeof options.now === "number" ? relativeTo(timestamp, options.now) : "",
    valid: true,
  };
}

/** "3 Jan 2024" or the fallback. */
export function formatDate(value: string | null | undefined, fallback = "Not available"): string {
  const formatted = formatDateTime(value, { style: "date" });
  return formatted.valid ? formatted.absolute : fallback;
}

/** "5 Sep 2026, 04:05 UTC" or the fallback. */
export function formatAbsolute(
  value: string | null | undefined,
  fallback = "Not available",
): string {
  const formatted = formatDateTime(value);
  return formatted.valid ? formatted.absolute : fallback;
}
