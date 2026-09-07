import {
  ACCOUNT_DELETION_CANCEL_CONFIRMATION,
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_EXPORT_CONFIRMATION,
  INITIAL_ACCOUNT_LIFECYCLE_STATE,
} from "@/lib/account/lifecycle-input";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  requireMutationAssurance: vi.fn(),
  verifyCurrentPassword: vi.fn(),
  fetchAccountApiAccountLifecycle: vi.fn(),
  requestAccountApiAccountExport: vi.fn(),
  requestAccountApiAccountDeletion: vi.fn(),
  cancelAccountApiAccountDeletion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  requireMutationAssurance: mocks.requireMutationAssurance,
}));
vi.mock("@/lib/supabase/verification-client", () => ({
  verifyCurrentPassword: mocks.verifyCurrentPassword,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api")),
  fetchAccountApiAccountLifecycle: mocks.fetchAccountApiAccountLifecycle,
  requestAccountApiAccountExport: mocks.requestAccountApiAccountExport,
  requestAccountApiAccountDeletion: mocks.requestAccountApiAccountDeletion,
  cancelAccountApiAccountDeletion: mocks.cancelAccountApiAccountDeletion,
}));

import {
  cancelAccountDeletion,
  requestAccountDeletion,
  requestAccountExport,
} from "@/app/account/data/actions";
import { AccountApiRequestError } from "@/lib/admin/account-api";

const lifecycle = {
  revision: "lifecycle-revision-123456",
  export_queue: { job_limit: 50, returned: 0, per_user_limit: 10 },
  exports: [],
  deletion: { active: null, requests: [] },
};

function form({
  revision = lifecycle.revision,
  currentPassword = "correct-password",
  confirmation = ACCOUNT_EXPORT_CONFIRMATION,
  requestId,
}: {
  revision?: string;
  currentPassword?: string;
  confirmation?: string;
  requestId?: string;
} = {}) {
  const data = new FormData();
  data.set("revision", revision);
  data.set("currentPassword", currentPassword);
  data.set("confirmation", confirmation);
  if (requestId) data.set("requestId", requestId);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-id", email: "user@example.test" } },
        error: null,
      }),
      getSession: async () => ({
        data: { session: { access_token: "server-token" } },
        error: null,
      }),
    },
  });
  mocks.requireMutationAssurance.mockResolvedValue({ decision: "satisfied" });
  mocks.verifyCurrentPassword.mockResolvedValue("verified");
  mocks.fetchAccountApiAccountLifecycle.mockResolvedValue(lifecycle);
  mocks.requestAccountApiAccountExport.mockResolvedValue({ ok: true });
  mocks.requestAccountApiAccountDeletion.mockResolvedValue({ ok: true });
  mocks.cancelAccountApiAccountDeletion.mockResolvedValue({ ok: true });
});

it("queues an account export after current-password reauthentication", async () => {
  const result = await requestAccountExport(INITIAL_ACCOUNT_LIFECYCLE_STATE, form());

  expect(result.status).toBe("success");
  expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith("user@example.test", "correct-password");
  expect(mocks.requestAccountApiAccountExport).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: lifecycle.revision,
      format: "json",
      confirmation: ACCOUNT_EXPORT_CONFIRMATION,
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
  expect(JSON.stringify(mocks.requestAccountApiAccountExport.mock.calls[0])).not.toContain(
    "correct-password",
  );
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/data");
});

it("allows the initial empty lifecycle revision", async () => {
  mocks.fetchAccountApiAccountLifecycle.mockResolvedValue({ ...lifecycle, revision: "" });

  const result = await requestAccountExport(
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
    form({ revision: "" }),
  );

  expect(result.status).toBe("success");
  expect(mocks.requestAccountApiAccountExport).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: "",
      format: "json",
      confirmation: ACCOUNT_EXPORT_CONFIRMATION,
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
});

it("creates and cancels deletion with typed confirmations", async () => {
  const deletion = await requestAccountDeletion(
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
    form({ confirmation: ACCOUNT_DELETION_CONFIRMATION }),
  );
  const cancellation = await cancelAccountDeletion(
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
    form({
      confirmation: ACCOUNT_DELETION_CANCEL_CONFIRMATION,
      requestId: "25000000-0000-4000-8000-000000000001",
    }),
  );

  expect(deletion.status).toBe("success");
  expect(cancellation.status).toBe("success");
  expect(mocks.requestAccountApiAccountDeletion).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: lifecycle.revision,
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
  expect(mocks.cancelAccountApiAccountDeletion).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: lifecycle.revision,
      request_id: "25000000-0000-4000-8000-000000000001",
      confirmation: ACCOUNT_DELETION_CANCEL_CONFIRMATION,
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
});

it.each([
  [
    "mfa",
    () => mocks.requireMutationAssurance.mockResolvedValue({ decision: "challenge-required" }),
  ],
  ["password", () => mocks.verifyCurrentPassword.mockResolvedValue("rejected")],
  [
    "stale",
    () =>
      mocks.fetchAccountApiAccountLifecycle.mockResolvedValue({ ...lifecycle, revision: "new" }),
  ],
  ["confirmation", () => undefined],
])("refuses the %s bypass before mutation", async (_name, setup) => {
  setup();
  const data =
    _name === "confirmation"
      ? form({ confirmation: "DELETE" })
      : form({ confirmation: ACCOUNT_DELETION_CONFIRMATION });

  const result = await requestAccountDeletion(INITIAL_ACCOUNT_LIFECYCLE_STATE, data);

  expect(result.status).toBe("error");
  expect(mocks.requestAccountApiAccountDeletion).not.toHaveBeenCalled();
});

it("maps lifecycle API conflicts to reload-safe messages", async () => {
  mocks.requestAccountApiAccountDeletion.mockRejectedValue(
    new AccountApiRequestError({
      status: 423,
      code: "legal_hold_active",
      message: "Held",
      correlationId: "qt-hold",
    }),
  );

  const result = await requestAccountDeletion(
    INITIAL_ACCOUNT_LIFECYCLE_STATE,
    form({ confirmation: ACCOUNT_DELETION_CONFIRMATION }),
  );

  expect(result.status).toBe("error");
  expect(result.message).toMatch(/legal hold/i);
});
