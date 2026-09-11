const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  approveAccountApiHandoff: vi.fn(),
  denyAccountApiHandoff: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return {
    ...actual,
    approveAccountApiHandoff: mocks.approveAccountApiHandoff,
    denyAccountApiHandoff: mocks.denyAccountApiHandoff,
  };
});

import { cancelDesktopConnect, connectDesktop } from "@/app/connect/desktop/actions";
import { AccountApiRequestError, AccountApiUnavailableError } from "@/lib/admin/account-api";
import { INITIAL_DESKTOP_CONNECT_STATE } from "@/lib/auth/desktop-connect";

const HANDOFF = "c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
const PATH = `/connect/desktop?handoff=${HANDOFF}`;
const LOGIN = `/login?next=${encodeURIComponent(PATH)}`;

function handoffForm(handoff = HANDOFF): FormData {
  const formData = new FormData();
  formData.set("handoff", handoff);
  return formData;
}

function apiError(status: number, message = "provider detail"): AccountApiRequestError {
  return new AccountApiRequestError({ status, code: "refused", message, correlationId: null });
}

const approved = {
  ok: true as const,
  correlation_id: "qt-handoff",
  status: "approved" as const,
  user_code: "K7X4-P2M9",
  device_name: "Aaryan's MacBook Pro",
  client: "desktop",
  intent: "login" as const,
  created_at: "2026-09-12T00:00:00Z",
  expires_at: "2026-09-12T00:10:00Z",
  approved_at: "2026-09-12T00:00:30Z",
};

describe("connectDesktop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "console-token" });
  });

  it("approves the request on the Account API and reports the code, never redirecting", async () => {
    mocks.approveAccountApiHandoff.mockResolvedValue(approved);

    const result = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());

    expect(result).toEqual({ status: "connected", message: null, userCode: "K7X4-P2M9" });
    expect(mocks.approveAccountApiHandoff).toHaveBeenCalledWith(
      "console-token",
      HANDOFF,
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/u) }),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("cancels the request through the deny route", async () => {
    mocks.denyAccountApiHandoff.mockResolvedValue({ ...approved, status: "denied" });

    const result = await cancelDesktopConnect(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());

    expect(result).toEqual({ status: "cancelled", message: null });
    expect(mocks.denyAccountApiHandoff).toHaveBeenCalledWith(
      "console-token",
      HANDOFF,
      expect.anything(),
    );
    expect(mocks.approveAccountApiHandoff).not.toHaveBeenCalled();
  });

  it("re-validates the handoff before touching the session", async () => {
    const result = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm("short"));

    expect(result.status).toBe("error");
    expect(mocks.createServerAzureClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor through sign-in and back to the same handoff", async () => {
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => null });

    await expect(connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm())).rejects.toThrow(
      `NEXT_REDIRECT:${LOGIN}`,
    );
    expect(mocks.approveAccountApiHandoff).not.toHaveBeenCalled();
  });

  it("treats an ended Account API session like a signed-out visitor", async () => {
    mocks.approveAccountApiHandoff.mockRejectedValue(apiError(401));

    await expect(connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm())).rejects.toThrow(
      `NEXT_REDIRECT:${LOGIN}`,
    );
  });

  it("explains an expired or already-answered request", async () => {
    mocks.approveAccountApiHandoff.mockRejectedValueOnce(apiError(409));
    const answered = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());
    mocks.approveAccountApiHandoff.mockRejectedValueOnce(apiError(404));
    const unknown = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());

    for (const result of [answered, unknown]) {
      expect(result.status).toBe("error");
      expect(result.message).toMatch(/expired or was already answered/u);
    }
  });

  it("reports a refused or failed handoff in place without provider detail", async () => {
    mocks.approveAccountApiHandoff.mockRejectedValueOnce(
      apiError(403, "Sensitive provider detail"),
    );
    const refused = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());

    mocks.approveAccountApiHandoff.mockRejectedValueOnce(new AccountApiUnavailableError());
    const failed = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());

    expect(refused).toEqual({
      status: "error",
      message: "This account can't connect the desktop app right now.",
    });
    expect(failed.status).toBe("error");
    expect(JSON.stringify([refused, failed])).not.toContain("Sensitive provider detail");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
