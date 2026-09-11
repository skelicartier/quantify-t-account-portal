import {
  AUDIT_FILTER_FIELDS,
  countActiveFilters,
  parseAuditFilters,
} from "@/lib/admin/audit-filters";
import {
  boundedInteger,
  buildPageHref,
  firstSearchValue,
  parsePagination,
} from "@/lib/search-params";

describe("search params", () => {
  it("takes the first repeated value and bounds integers", () => {
    expect(firstSearchValue(["3", "4"])).toBe("3");
    expect(firstSearchValue("7")).toBe("7");
    expect(firstSearchValue(undefined)).toBeUndefined();
    expect(boundedInteger(undefined, 50, 100)).toBe(50);
    expect(boundedInteger("-4", 50, 100)).toBe(50);
    expect(boundedInteger("abc", 50, 100)).toBe(50);
    expect(boundedInteger("500", 50, 100)).toBe(100);
  });

  it("parses pagination with the admin bounds", () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination({ limit: "0", offset: "25" })).toEqual({ limit: 1, offset: 25 });
    expect(parsePagination({ limit: ["25"], offset: "999999999" })).toEqual({
      limit: 25,
      offset: 100_000,
    });
  });

  it("builds hrefs with offset first, then limit, then non-empty filters", () => {
    expect(buildPageHref("/admin/users", 25, 25)).toBe("/admin/users?offset=25&limit=25");
    expect(
      buildPageHref("/admin/audit", -5, 25, { event_type: "session.revoked", outcome: " " }),
    ).toBe("/admin/audit?offset=0&limit=25&event_type=session.revoked");
  });

  it("parses only the known audit filters and counts the active ones", () => {
    expect(AUDIT_FILTER_FIELDS.map((field) => field.label)).toEqual([
      "Event",
      "Outcome",
      "Source",
      "Subject",
      "Actor",
      "Session",
      "Request",
    ]);
    const filters = parseAuditFilters({
      event_type: " session.revoked ",
      outcome: "",
      request_id: ["req-1", "req-2"],
      unknown: "ignored",
    });
    expect(filters).toEqual({ event_type: "session.revoked", request_id: "req-1" });
    expect(countActiveFilters(filters)).toBe(2);
  });
});

describe("parseUserFilters", () => {
  it("keeps a trimmed search and a known status, dropping anything else", async () => {
    const { parseUserFilters } = await import("@/lib/search-params");
    expect(parseUserFilters({ q: "  owner ", status: "Active" })).toEqual({
      q: "owner",
      status: "active",
    });
    expect(parseUserFilters({ q: ["first", "second"], status: "sleeping" })).toEqual({
      q: "first",
    });
    expect(parseUserFilters({})).toEqual({});
    expect(parseUserFilters({ q: "x".repeat(200) }).q).toHaveLength(120);
  });
});
