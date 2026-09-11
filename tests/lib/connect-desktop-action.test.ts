const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  startAccountApiHandoff: vi.fn(),
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
  return { ...actual, startAccountApiHandoff: mocks.startAccountApiHandoff };
});

import { connectDesktop } from "@/app/connect/desktop/actions";
import { AccountApiRequestError, AccountApiUnavailableError } from "@/lib/admin/account-api";
import { INITIAL_DESKTOP_CONNECT_STATE } from "@/lib/auth/desktop-connect";

const STATE = "c2VjcmV0LXN0YXRlLWZyb20tdGhlLWFwcA";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const PATH = `/connect/desktop?state=${STATE}&port=53321&challenge=${CHALLENGE}`;
const LOGIN = `/login?next=${encodeURIComponent(PATH)}`;

function handoffForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields = { state: STATE, port: "53321", challenge: CHALLENGE, ...overrides };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

function apiError(status: number, message = "provider detail"): AccountApiRequestError {
  return new AccountApiRequestError({ status, code: "refused", message, correlationId: null });
}

describe("connectDesktop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "console-token" });
  });

  it("mints a code bound to the challenge and sends the browser to the loopback listener", async () => {
    mocks.startAccountApiHandoff.mockResolvedValue({
      ok: true,
      correlation_id: "qt-handoff",
      code: "one-time-code",
      expires_at: "2026-09-11T10:02:00Z",
    });

    await expect(connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm())).rejects.toThrow(
      `NEXT_REDIRECT:http://127.0.0.1:53321/callback?code=one-time-code&state=${STATE}`,
    );

    expect(mocks.startAccountApiHandoff).toHaveBeenCalledWith(
      "console-token",
      { challenge: CHALLENGE },
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/u) }),
    );
  });

  it("re-validates the handoff before touching the session", async () => {
    const result = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm({ port: "80" }));

    expect(result.status).toBe("error");
    expect(mocks.createServerAzureClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor through sign-in and back to the same handoff", async () => {
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => null });

    await expect(connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm())).rejects.toThrow(
      `NEXT_REDIRECT:${LOGIN}`,
    );
    expect(mocks.startAccountApiHandoff).not.toHaveBeenCalled();
  });

  it("treats an ended Account API session like a signed-out visitor", async () => {
    mocks.startAccountApiHandoff.mockRejectedValue(apiError(401));

    await expect(connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm())).rejects.toThrow(
      `NEXT_REDIRECT:${LOGIN}`,
    );
  });

  it("reports a refused or failed handoff in place without provider detail", async () => {
    mocks.startAccountApiHandoff.mockRejectedValueOnce(apiError(403, "Sensitive provider detail"));
    const refused = await connectDesktop(INITIAL_DESKTOP_CONNECT_STATE, handoffForm());

    mocks.startAccountApiHandoff.mockRejectedValueOnce(new AccountApiUnavailableError());
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
