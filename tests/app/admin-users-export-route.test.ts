// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminUsersExportAccess: vi.fn(),
  fetchAccountApiAdminUsers: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({
  getAdminUsersExportAccess: mocks.getAdminUsersExportAccess,
}));

vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return { ...actual, fetchAccountApiAdminUsers: mocks.fetchAccountApiAdminUsers };
});

import { GET } from "@/app/admin/users/export/route";

const me = {
  ok: true as const,
  correlation_id: "qt-me",
  user: {
    user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    email: "o@example.test",
    is_active: true,
  },
  role: {
    effective: "owner" as const,
    database: "owner" as const,
    legacy: null,
    mismatch: "x",
    break_glass: false,
  },
  capabilities: ["account:read-any"],
  environment: "production",
};

function page(offset: number, emails: string[], hasMore: boolean) {
  return {
    ok: true as const,
    correlation_id: "qt-users",
    generated_at: "2026-09-11T12:00:00Z",
    pagination: {
      limit: 100,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + emails.length : null,
      total: 3,
    },
    users: emails.map((email, index) => ({
      user: {
        user_id: `860aac31-73fb-4e10-8f3f-bfcf22a71c1${index}`,
        email,
        first_name: "A",
        last_name: "B",
        display_name: "A B",
        is_active: true,
        subscription_tier: "free",
        created_at: "2026-09-01T00:00:00Z",
        last_login_at: "",
        updated_at: "2026-09-01T00:00:00Z",
      },
      role: me.role,
    })),
  };
}

describe("GET /admin/users/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams every page of the filtered directory as a CSV attachment", async () => {
    mocks.getAdminUsersExportAccess.mockResolvedValue({
      status: "authorized",
      me,
      accessToken: "token",
    });
    mocks.fetchAccountApiAdminUsers
      .mockResolvedValueOnce(page(0, ["a@example.test", "b@example.test"], true))
      .mockResolvedValueOnce(page(2, ["c@example.test"], false));

    const response = await GET(
      new Request("https://console.example/admin/users/export?q=example&status=active&limit=9"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="quantify-terminal-users-\d{4}-\d{2}-\d{2}\.csv"$/u,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-export-rows")).toBe("3");
    const body = await response.text();
    expect(body.split("\r\n").filter(Boolean)).toHaveLength(4);
    expect(body).toContain("c@example.test");
    expect(mocks.fetchAccountApiAdminUsers).toHaveBeenNthCalledWith(1, "token", {
      limit: 100,
      offset: 0,
      q: "example",
      status: "active",
    });
    expect(mocks.fetchAccountApiAdminUsers).toHaveBeenNthCalledWith(2, "token", {
      limit: 100,
      offset: 2,
      q: "example",
      status: "active",
    });
  });

  it("sends a signed-out caller to the login page and refuses everyone else", async () => {
    mocks.getAdminUsersExportAccess.mockResolvedValueOnce({ status: "unauthenticated" });
    const redirected = await GET(new Request("https://console.example/admin/users/export"));
    expect(redirected.status).toBe(303);
    expect(redirected.headers.get("location")).toBe(
      "https://console.example/login?next=%2Fadmin%2Fusers",
    );

    mocks.getAdminUsersExportAccess.mockResolvedValueOnce({ status: "forbidden", me });
    const forbidden = await GET(new Request("https://console.example/admin/users/export"));
    expect(forbidden.status).toBe(403);

    mocks.getAdminUsersExportAccess.mockResolvedValueOnce({ status: "mfa-required", me });
    const mfa = await GET(new Request("https://console.example/admin/users/export"));
    expect(mfa.status).toBe(403);
    expect(mocks.fetchAccountApiAdminUsers).not.toHaveBeenCalled();
  });

  it("answers 503 when the directory cannot be read", async () => {
    mocks.getAdminUsersExportAccess.mockResolvedValue({
      status: "authorized",
      me,
      accessToken: "token",
    });
    mocks.fetchAccountApiAdminUsers.mockRejectedValueOnce(new Error("upstream"));
    const response = await GET(new Request("https://console.example/admin/users/export"));
    expect(response.status).toBe(503);
  });
});
