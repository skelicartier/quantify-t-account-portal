import { INITIAL_NOTIFICATION_STATE } from "@/lib/notifications/input";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  requireMutationAssurance: vi.fn(),
  recordAccountApiNotificationReceipt: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  requireMutationAssurance: mocks.requireMutationAssurance,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api")),
  recordAccountApiNotificationReceipt: mocks.recordAccountApiNotificationReceipt,
}));
import { acknowledgeNotification } from "@/app/account/notifications/actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createServerAzureClient.mockResolvedValue({
    getAccessToken: () => "server-token",
  });
  mocks.requireMutationAssurance.mockResolvedValue({ decision: "satisfied" });
  mocks.recordAccountApiNotificationReceipt.mockResolvedValue({ ok: true });
});

it("records receipts using only the current bearer identity", async () => {
  const data = new FormData();
  data.set("notificationId", "notice1");
  data.set("status", "read");
  expect((await acknowledgeNotification(INITIAL_NOTIFICATION_STATE, data)).status).toBe("success");
  expect(mocks.recordAccountApiNotificationReceipt).toHaveBeenCalledWith(
    "server-token",
    "notice1",
    "read",
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/notifications");
  mocks.requireMutationAssurance.mockResolvedValue({ decision: "challenge-required" });
  expect((await acknowledgeNotification(INITIAL_NOTIFICATION_STATE, data)).status).toBe("error");
  expect(mocks.recordAccountApiNotificationReceipt).toHaveBeenCalledTimes(1);
});
