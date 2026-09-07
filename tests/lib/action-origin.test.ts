const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { requireSameOriginServerAction, SameOriginActionError } from "@/lib/security/action-origin";

const ENV = {
  NEXT_PUBLIC_SITE_URL: "https://console.quantifyterminal.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-public-value",
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = { ...originalEnv, ...ENV, NODE_ENV: "production" };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

it("allows Server Actions from the configured portal origin", async () => {
  mocks.headers.mockResolvedValue(new Headers({ origin: ENV.NEXT_PUBLIC_SITE_URL }));

  await expect(requireSameOriginServerAction()).resolves.toBeUndefined();
});

it("accepts a same-origin referer when Origin is absent", async () => {
  mocks.headers.mockResolvedValue(
    new Headers({ referer: `${ENV.NEXT_PUBLIC_SITE_URL}/account/security` }),
  );

  await expect(requireSameOriginServerAction()).resolves.toBeUndefined();
});

it("rejects cross-origin Server Action requests", async () => {
  mocks.headers.mockResolvedValue(new Headers({ origin: "https://evil.example" }));

  await expect(requireSameOriginServerAction()).rejects.toBeInstanceOf(SameOriginActionError);
});

it("fails closed on missing request provenance in production", async () => {
  mocks.headers.mockResolvedValue(new Headers());

  await expect(requireSameOriginServerAction()).rejects.toBeInstanceOf(SameOriginActionError);
});

it("allows requestless unit tests without weakening production", async () => {
  vi.stubEnv("NODE_ENV", "test");
  mocks.headers.mockRejectedValue(new Error("outside request"));

  await expect(requireSameOriginServerAction()).resolves.toBeUndefined();
});
