const mocks = vi.hoisted(() => ({
  beginRegistration: vi.fn(),
  finishRegistration: vi.fn(),
  beginVerification: vi.fn(),
  finishVerification: vi.fn(),
  remove: vi.fn(),
  createPasskey: vi.fn(),
  getPasskey: vi.fn(),
}));

vi.mock("@/app/account/security/passkey-actions", () => ({
  beginPasskeyRegistration: mocks.beginRegistration,
  finishPasskeyRegistration: mocks.finishRegistration,
  beginPasskeyVerification: mocks.beginVerification,
  finishPasskeyVerification: mocks.finishVerification,
  removePasskey: mocks.remove,
}));
vi.mock("@/lib/passkeys/browser", async (original) => ({
  ...(await original<typeof import("@/lib/passkeys/browser")>()),
  createPasskey: mocks.createPasskey,
  getPasskey: mocks.getPasskey,
}));

import { PasskeyBrowserError } from "@/lib/passkeys/browser";
import { addPasskey, provePasskey, removePasskey } from "@/lib/passkeys/ceremony";

const OK = { status: "ok" as const, value: null };
const NEEDS_PASSKEY = {
  status: "error" as const,
  reason: "needs-passkey" as const,
  message: "Confirm with a passkey this account already has, then try again.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginRegistration.mockResolvedValue({ status: "ok", value: { challenge: "reg" } });
  mocks.finishRegistration.mockResolvedValue(OK);
  mocks.beginVerification.mockResolvedValue({ status: "ok", value: { challenge: "ver" } });
  mocks.finishVerification.mockResolvedValue(OK);
  mocks.remove.mockResolvedValue(OK);
  mocks.createPasskey.mockResolvedValue({ id: "made" });
  mocks.getPasskey.mockResolvedValue({ id: "used" });
});

describe("proving a passkey", () => {
  it("hands the service's challenge to the device and the device's answer back", async () => {
    await expect(provePasskey()).resolves.toEqual(OK);

    expect(mocks.getPasskey).toHaveBeenCalledWith({ challenge: "ver" });
    expect(mocks.finishVerification).toHaveBeenCalledWith({ id: "used" });
  });

  it("stops at the service's refusal without touching the device", async () => {
    mocks.beginVerification.mockResolvedValue({ status: "error", reason: "signed-out", message: "Sign in again." });

    await expect(provePasskey()).resolves.toMatchObject({ reason: "signed-out" });
    expect(mocks.getPasskey).not.toHaveBeenCalled();
  });

  it("turns a dismissed prompt into a sentence, not an exception", async () => {
    mocks.getPasskey.mockRejectedValue(new PasskeyBrowserError("cancelled", "The passkey prompt was dismissed."));

    await expect(provePasskey()).resolves.toEqual({
      status: "error",
      reason: "refused",
      message: "The passkey prompt was dismissed.",
    });
    expect(mocks.finishVerification).not.toHaveBeenCalled();
  });

  it("calls anything it does not recognise unavailable", async () => {
    mocks.finishVerification.mockRejectedValue(new Error("network"));

    await expect(provePasskey()).resolves.toMatchObject({ reason: "unavailable" });
  });
});

describe("adding a passkey", () => {
  it("makes one on this device and stores it under the name given", async () => {
    await expect(addPasskey({ password: "pw", name: "Laptop" })).resolves.toEqual(OK);

    expect(mocks.beginRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.createPasskey).toHaveBeenCalledWith({ challenge: "reg" });
    expect(mocks.finishRegistration).toHaveBeenCalledWith("Laptop", { id: "made" });
    expect(mocks.getPasskey).not.toHaveBeenCalled();
  });

  it("asks for the passkey already held when the service wants a recent proof, then carries on", async () => {
    mocks.beginRegistration
      .mockResolvedValueOnce(NEEDS_PASSKEY)
      .mockResolvedValueOnce({ status: "ok", value: { challenge: "reg-2" } });

    await expect(addPasskey({ password: "pw", name: "Phone" })).resolves.toEqual(OK);

    expect(mocks.getPasskey).toHaveBeenCalledTimes(1);
    expect(mocks.beginRegistration).toHaveBeenCalledTimes(2);
    expect(mocks.createPasskey).toHaveBeenCalledWith({ challenge: "reg-2" });
  });

  it("adds nothing when the existing passkey is not proved", async () => {
    mocks.beginRegistration.mockResolvedValue(NEEDS_PASSKEY);
    mocks.finishVerification.mockResolvedValue({ status: "error", reason: "refused", message: "Not accepted." });

    await expect(addPasskey({ password: "pw", name: "Phone" })).resolves.toMatchObject({ message: "Not accepted." });
    expect(mocks.createPasskey).not.toHaveBeenCalled();
    expect(mocks.finishRegistration).not.toHaveBeenCalled();
  });

  it("does not loop when the service keeps asking", async () => {
    mocks.beginRegistration.mockResolvedValue(NEEDS_PASSKEY);

    await expect(addPasskey({ password: "pw", name: "Phone" })).resolves.toMatchObject({ reason: "needs-passkey" });
    expect(mocks.beginRegistration).toHaveBeenCalledTimes(2);
  });

  it("reports a wrong password as it stands", async () => {
    mocks.beginRegistration.mockResolvedValue({ status: "error", reason: "password", message: "That password is not correct." });

    await expect(addPasskey({ password: "no", name: "" })).resolves.toMatchObject({ reason: "password" });
    expect(mocks.createPasskey).not.toHaveBeenCalled();
  });
});

describe("removing a passkey", () => {
  it("removes it when the session's proof is recent", async () => {
    await expect(removePasskey("pk-1")).resolves.toEqual(OK);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.getPasskey).not.toHaveBeenCalled();
  });

  it("asks the device first when the service wants a recent proof", async () => {
    mocks.remove.mockResolvedValueOnce(NEEDS_PASSKEY).mockResolvedValueOnce(OK);

    await expect(removePasskey("pk-1")).resolves.toEqual(OK);
    expect(mocks.getPasskey).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });

  it("removes nothing when the proof is refused", async () => {
    mocks.remove.mockResolvedValue(NEEDS_PASSKEY);
    mocks.getPasskey.mockRejectedValue(new PasskeyBrowserError("cancelled", "Dismissed."));

    await expect(removePasskey("pk-1")).resolves.toMatchObject({ message: "Dismissed." });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
