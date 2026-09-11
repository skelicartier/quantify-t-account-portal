import {
  ASSIGNABLE_ROLES,
  capabilityLabel,
  isAssignableRole,
  mismatchLabel,
  mismatchTone,
  roleDescription,
  roleLabel,
  roleReportStatus,
  roleTone,
} from "@/lib/admin/role-labels";

describe("role labels", () => {
  it("names every assignable role and degrades unknown ones", () => {
    expect(ASSIGNABLE_ROLES).toEqual(["owner", "admin", "support", "user"]);
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("support")).toBe("Support");
    expect(roleLabel("something-else")).toBe("Something Else");
    expect(roleLabel(null)).toBe("User");
    expect(roleDescription("admin")).toMatch(/cannot assign roles/i);
    expect(roleDescription("mystery")).toBe("");
    expect(roleTone("admin")).toBe("admin");
    expect(roleTone(undefined)).toBe("user");
    expect(isAssignableRole("owner")).toBe(true);
    expect(isAssignableRole("root")).toBe(false);
  });

  it("translates capability tokens into product language", () => {
    expect(capabilityLabel("roles:write")).toBe("Manage roles");
    expect(capabilityLabel("audit:read")).toBe("Audit access");
    expect(capabilityLabel("account:read-any")).toBe("Administration access");
    expect(capabilityLabel("future:thing")).toBe("Future thing");
  });

  it("describes reconciliation states without backend vocabulary", () => {
    expect(mismatchLabel("match")).toBe("In sync");
    expect(mismatchLabel("missing-in-database")).toBe("Missing from database");
    expect(mismatchLabel("break-glass-override")).toBe("Set by configuration");
    expect(mismatchLabel(undefined)).toBe("Unknown");
    expect(mismatchTone("match")).toBe("live");
    expect(mismatchTone("missing-in-legacy")).toBe("neutral");
    expect(mismatchTone("divergent")).toBe("attention");
  });

  it("keeps the role report verdict strings", () => {
    const base = {
      legacy_source_available: true,
      legacy_unparsable_entry_count: 0,
      legacy_retirement_ready: false,
    };
    expect(roleReportStatus(null)).toBe("Not permitted");
    expect(roleReportStatus({ ...base, legacy_source_available: false })).toBe(
      "Legacy store unreadable",
    );
    expect(roleReportStatus({ ...base, legacy_unparsable_entry_count: 2 })).toBe(
      "Legacy entries need review",
    );
    expect(roleReportStatus({ ...base, legacy_retirement_ready: true })).toBe(
      "Ready for reviewed cutover",
    );
    expect(roleReportStatus(base)).toBe("Differences need review");
  });
});
