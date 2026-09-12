import {
  formatAbsolute,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDurationSeconds,
  formatLabel,
  formatNumber,
  formatPercent,
  formatSentence,
  pluralize,
} from "@/lib/format";

describe("formatLabel", () => {
  it.each([
    ["login_success", "Login Success"],
    ["mfa.challenge", "MFA Challenge"],
    ["session.heartbeat", "Session Heartbeat"],
    ["supabase_service_role", "Supabase Service Role"],
    ["audit-events", "Audit Events"],
    ["account:read-any", "Account Read Any"],
    ["", ""],
    [null, ""],
  ])("formats %s as %s", (input, expected) => {
    expect(formatLabel(input)).toBe(expected);
  });

  it("keeps acronyms upper-case in sentence case", () => {
    expect(formatSentence("missing-in-database")).toBe("Missing in database");
    expect(formatSentence("api_key_rotated")).toBe("API key rotated");
  });
});

describe("numbers and sizes", () => {
  it("groups numbers and falls back for missing values", () => {
    expect(formatNumber(16384)).toBe("16,384");
    expect(formatNumber(null)).toBe("Not available");
    expect(pluralize(1, "account")).toBe("1 account");
    expect(pluralize(12, "account")).toBe("12 accounts");
  });

  it("renders byte counts in binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(16384)).toBe("16 KB");
    expect(formatBytes(1_048_576)).toBe("1 MB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
    expect(formatBytes(-1)).toBe("Not available");
  });

  it("renders whole durations in the largest exact unit", () => {
    expect(formatDurationSeconds(8)).toBe("8 s");
    expect(formatDurationSeconds(180)).toBe("3 min");
    expect(formatDurationSeconds(900)).toBe("15 min");
    expect(formatDurationSeconds(3600)).toBe("1 h");
    expect(formatDurationSeconds(86400)).toBe("1 day");
    expect(formatDurationSeconds(1_209_600)).toBe("14 days");
    expect(formatDurationSeconds(5400)).toBe("1.5 h");
  });
});

describe("dates", () => {
  const now = Date.parse("2026-09-11T12:00:00Z");

  it("renders a deterministic UTC absolute form", () => {
    const formatted = formatDateTime("2026-09-05T04:05:00Z", { now });
    expect(formatted.valid).toBe(true);
    expect(formatted.iso).toBe("2026-09-05T04:05:00.000Z");
    expect(formatted.absolute).toBe("5 Sep 2026, 04:05 UTC");
    expect(formatted.relative).toBe("6 days ago");
  });

  it("omits the relative form without a reference instant", () => {
    expect(formatDateTime("2026-09-05T04:05:00Z").relative).toBe("");
    expect(formatAbsolute("2026-09-05T04:05:00Z")).toBe("5 Sep 2026, 04:05 UTC");
    expect(formatDate("2024-01-03T10:00:00Z")).toBe("3 Jan 2024");
  });

  it("uses natural words for near and far instants", () => {
    expect(formatDateTime("2026-09-11T11:59:50Z", { now }).relative).toBe("just now");
    expect(formatDateTime("2026-09-11T11:30:00Z", { now }).relative).toBe("30 minutes ago");
    expect(formatDateTime("2026-09-11T14:00:00Z", { now }).relative).toBe("in 2 hours");
    expect(formatDateTime("2025-09-11T12:00:00Z", { now }).relative).toBe("last year");
  });

  it("fails soft on garbage", () => {
    expect(formatDateTime("not a date").valid).toBe(false);
    expect(formatDate("")).toBe("Not available");
    expect(formatAbsolute(null, "Never")).toBe("Never");
  });
});

describe("formatPercent", () => {
  it("rounds a share to whole points for comparison at a glance", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.2494)).toBe("25%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("never reads a live share as none, or a partial one as all", () => {
    expect(formatPercent(0.0004)).toBe("<1%");
    expect(formatPercent(0.999)).toBe(">99%");
  });

  it("fails soft on a value that is not a share", () => {
    expect(formatPercent(Number.NaN)).toBe("Not available");
    expect(formatPercent(null)).toBe("Not available");
  });
});
