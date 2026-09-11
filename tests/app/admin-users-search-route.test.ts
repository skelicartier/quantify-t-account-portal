// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminRecipientSearchAccess: vi.fn(),
  fetchAccountApiAdminUsers: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({
  getAdminRecipientSearchAccess: mocks.getAdminRecipientSearchAccess,
}));

vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return { ...actual, fetchAccountApiAdminUsers: mocks.fetchAccountApiAdminUsers };
});

import { AccountApiRequestError } from "@/lib/admin/account-api";
import { GET } from "@/app/admin/users/search/route";

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
  capabilities: ["account:read-any", "notifications:write"],
  environment: "production",
};

const page = {
  ok: true as const,
  correlation_id: "qt-users",
  generated_at: "2026-09-12T00:00:00Z",
  pagination: { limit: 20, offset: 0, has_more: true, next_offset: 20, total: 41 },
  users: [
    {
      user: {
        user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c10",
        email: "priya@example.test",
        first_name: "Priya",
        last_name: "Natarajan",
        display_name: "Priya Natarajan",
        is_active: true,
        subscription_tier: "pro",
        created_at: "2026-09-01T00:00:00Z",
        last_login_at: "2026-09-11T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      role: me.role,
    },
    {
      user: {
        user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c12",
        email: "dormant@example.test",
        first_name: "",
        last_name: "",
        display_name: "",
        is_active: false,
        subscription_tier: "free",
        created_at: "2026-09-01T00:00:00Z",
        last_login_at: "",
        updated_at: "2026-09-01T00:00:00Z",
      },
      role: me.role,
    },
  ],
};

describe("GET /admin/users/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the minimal recipient projection for the query, never cached", async () => {
    mocks.getAdminRecipientSearchAccess.mockResolvedValue({
      status: "authorized",
      me,
      accessToken: "token",
    });
    mocks.fetchAccountApiAdminUsers.mockResolvedValue(page);

    const response = await GET(new Request("https://console.example/admin/users/search?q=pri"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.fetchAccountApiAdminUsers).toHaveBeenCalledWith("token", {
      limit: 20,
      offset: 0,
      q: "pri",
    });
    await expect(response.json()).resolves.toStrictEqual({
      accounts: [
        {
          id: "860aac31-73fb-4e10-8f3f-bfcf22a71c10",
          email: "priya@example.test",
          name: "Priya Natarajan",
          active: true,
        },
        {
          id: "860aac31-73fb-4e10-8f3f-bfcf22a71c12",
          email: "dormant@example.test",
          name: "",
          active: false,
        },
      ],
      has_more: true,
    });
  });

  it("lists the first page when the query is blank and caps the query length", async () => {
    mocks.getAdminRecipientSearchAccess.mockResolvedValue({
      status: "authorized",
      me,
      accessToken: "token",
    });
    mocks.fetchAccountApiAdminUsers.mockResolvedValue({ ...page, users: [] });

    await GET(new Request("https://console.example/admin/users/search"));
    expect(mocks.fetchAccountApiAdminUsers).toHaveBeenLastCalledWith("token", {
      limit: 20,
      offset: 0,
    });

    await GET(new Request(`https://console.example/admin/users/search?q=${"x".repeat(300)}`));
    expect(mocks.fetchAccountApiAdminUsers).toHaveBeenLastCalledWith("token", {
      limit: 20,
      offset: 0,
      q: "x".repeat(120),
    });
  });

  it("answers 401 and 403 as JSON instead of redirecting", async () => {
    mocks.getAdminRecipientSearchAccess.mockResolvedValueOnce({ status: "unauthenticated" });
    const signedOut = await GET(new Request("https://console.example/admin/users/search?q=a"));
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers.get("cache-control")).toBe("no-store");

    for (const status of ["forbidden", "mfa-required"] as const) {
      mocks.getAdminRecipientSearchAccess.mockResolvedValueOnce({ status, me });
      const refused = await GET(new Request("https://console.example/admin/users/search?q=a"));
      expect(refused.status).toBe(403);
      await expect(refused.json()).resolves.toStrictEqual({ error: status });
    }
    expect(mocks.fetchAccountApiAdminUsers).not.toHaveBeenCalled();
  });

  it("maps an expired API session to 401 and other failures to 503", async () => {
    mocks.getAdminRecipientSearchAccess.mockResolvedValue({
      status: "authorized",
      me,
      accessToken: "token",
    });
    mocks.fetchAccountApiAdminUsers.mockRejectedValueOnce(
      new AccountApiRequestError({
        status: 401,
        code: "unauthorized",
        message: "expired",
        correlationId: "qt-1",
      }),
    );
    expect((await GET(new Request("https://console.example/admin/users/search?q=a"))).status).toBe(
      401,
    );

    mocks.fetchAccountApiAdminUsers.mockRejectedValueOnce(new Error("boom"));
    const failed = await GET(new Request("https://console.example/admin/users/search?q=a"));
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toStrictEqual({ error: "directory_unavailable" });
  });
});
