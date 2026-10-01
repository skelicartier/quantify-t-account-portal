import { ASSIGNABLE_ROLES, isAssignableRole, roleLabel, roleTone } from "@/lib/admin/role-labels";

describe("role labels", () => {
  it("names every role and degrades unknown ones", () => {
    // The order is a ladder of reach rather than an alphabet. It mirrors CANONICAL_ROLES in
    // the Account API's capabilities.py, and is the set `/me` may answer with.
    expect(ASSIGNABLE_ROLES).toEqual([
      "owner",
      "admin",
      "support_manager",
      "billing_manager",
      "auditor",
      "support",
      "user",
    ]);
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("support")).toBe("Support agent");
    expect(roleLabel("support_manager")).toBe("Support manager");
    expect(roleLabel("something-else")).toBe("Something Else");
    expect(roleLabel(null)).toBe("User");
    expect(isAssignableRole("owner")).toBe(true);
    expect(isAssignableRole("support_manager")).toBe(true);
    expect(isAssignableRole("root")).toBe(false);
  });

  it("gives every role a badge tone without inventing one per role", () => {
    // Five near-identical outlines would read as five unrelated things rather than as a
    // scale, so the tones say how much reach a role has and not which role it is.
    expect(roleTone("admin")).toBe("admin");
    expect(roleTone("support_manager")).toBe("admin");
    expect(roleTone("billing_manager")).toBe("admin");
    expect(roleTone("auditor")).toBe("support");
    expect(roleTone("support")).toBe("support");
    expect(roleTone(undefined)).toBe("user");
    expect(roleTone("root")).toBe("user");
  });
});
