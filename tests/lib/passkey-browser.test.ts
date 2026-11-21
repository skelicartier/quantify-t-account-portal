import {
  PasskeyBrowserError,
  base64UrlToBytes,
  bytesToBase64Url,
  createPasskey,
  creationOptionsFromJson,
  getPasskey,
  passkeysSupported,
  requestOptionsFromJson,
} from "@/lib/passkeys/browser";

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

function named(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

const credentials = { create: vi.fn(), get: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "PublicKeyCredential", { value: function () {}, configurable: true });
  Object.defineProperty(navigator, "credentials", { value: credentials, configurable: true });
});

describe("bytes and base64url", () => {
  it("round-trips every byte value without padding or url-unsafe characters", () => {
    const all = new Uint8Array(256).map((_value, index) => index);
    const text = bytesToBase64Url(all);

    expect(text).not.toMatch(/[+/=]/u);
    expect(Array.from(base64UrlToBytes(text))).toEqual(Array.from(all));
  });

  it("reads a view over part of a buffer as that part only", () => {
    const view = new Uint8Array(bytes(9, 1, 2, 3, 9), 1, 3);

    expect(bytesToBase64Url(view)).toBe(bytesToBase64Url(bytes(1, 2, 3)));
    expect(bytesToBase64Url(null)).toBe("");
  });
});

describe("the options the device is handed", () => {
  const creation = {
    challenge: bytesToBase64Url(bytes(1, 2, 3, 4)),
    rp: { id: "console.example.test", name: "Quantify Terminal" },
    user: { id: bytesToBase64Url(bytes(7, 7)), name: "owner@example.test", displayName: "Owner" },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
      { type: "public-key", alg: "nonsense" },
    ],
    timeout: 120_000,
    attestation: "direct",
    authenticatorSelection: { residentKey: "preferred", userVerification: "discouraged" },
    excludeCredentials: [{ type: "public-key", id: bytesToBase64Url(bytes(5, 6)) }, { id: "" }],
  };

  it("always asks the device to check the person, whatever the answer said", () => {
    const options = creationOptionsFromJson(creation);

    expect(options.authenticatorSelection?.userVerification).toBe("required");
    expect(options.attestation).toBe("none");
    expect(options.rp).toEqual({ id: "console.example.test", name: "Quantify Terminal" });
    expect(Array.from(new Uint8Array(options.challenge as ArrayBuffer))).toEqual([1, 2, 3, 4]);
    expect(options.pubKeyCredParams.map((item) => item.alg)).toEqual([-7, -257]);
    expect(options.excludeCredentials).toHaveLength(1);
  });

  it("names only the account's own credentials when proving one", () => {
    const options = requestOptionsFromJson({
      challenge: bytesToBase64Url(bytes(9)),
      rpId: "console.example.test",
      userVerification: "preferred",
      allowCredentials: [{ type: "public-key", id: bytesToBase64Url(bytes(5, 6)) }],
    });

    expect(options.rpId).toBe("console.example.test");
    expect(options.userVerification).toBe("required");
    expect(options.allowCredentials).toHaveLength(1);
  });
});

describe("making and proving a passkey", () => {
  it("hands back the device's answer in the form the service takes", async () => {
    credentials.create.mockResolvedValue({
      id: "cred-1",
      rawId: bytes(1, 2),
      response: { clientDataJSON: bytes(3), attestationObject: bytes(4, 5) },
    });

    const made = await createPasskey({ challenge: "AQID", rp: { id: "console.example.test" }, user: { id: "Bwc" } });

    expect(made).toEqual({
      id: "cred-1",
      rawId: bytesToBase64Url(bytes(1, 2)),
      type: "public-key",
      response: {
        clientDataJSON: bytesToBase64Url(bytes(3)),
        attestationObject: bytesToBase64Url(bytes(4, 5)),
      },
    });
  });

  it("hands back a proof with its signature", async () => {
    credentials.get.mockResolvedValue({
      id: "cred-1",
      rawId: bytes(1, 2),
      response: { clientDataJSON: bytes(3), authenticatorData: bytes(6), signature: bytes(7, 8) },
    });

    const proof = await getPasskey({ challenge: "AQID", rpId: "console.example.test" });

    expect(proof.response).toEqual({
      clientDataJSON: bytesToBase64Url(bytes(3)),
      authenticatorData: bytesToBase64Url(bytes(6)),
      signature: bytesToBase64Url(bytes(7, 8)),
    });
  });

  it.each([
    ["NotAllowedError", "cancelled", /dismissed or timed out/u],
    ["AbortError", "cancelled", /dismissed or timed out/u],
    ["InvalidStateError", "exists", /already holds a passkey/u],
    ["SecurityError", "address", /cannot be used at this address/u],
    ["UnknownError", "failed", /could not complete/u],
  ])("says what a %s means when making one", async (name, reason, message) => {
    credentials.create.mockRejectedValue(named(name));

    const failure = await createPasskey({ challenge: "AQID" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PasskeyBrowserError);
    expect((failure as PasskeyBrowserError).reason).toBe(reason);
    expect((failure as PasskeyBrowserError).message).toMatch(message);
  });

  it("does not call a dismissed prompt an existing passkey when proving one", async () => {
    credentials.get.mockRejectedValue(named("InvalidStateError"));

    const failure = await getPasskey({ challenge: "AQID" }).catch((error: unknown) => error);

    expect((failure as PasskeyBrowserError).reason).toBe("failed");
  });

  it("treats an empty answer from the device as a failure, not a passkey", async () => {
    credentials.create.mockResolvedValue(null);
    credentials.get.mockResolvedValue({ id: "x", rawId: bytes(1), response: {} });

    await expect(createPasskey({ challenge: "AQID" })).rejects.toBeInstanceOf(PasskeyBrowserError);
    await expect(getPasskey({ challenge: "AQID" })).rejects.toBeInstanceOf(PasskeyBrowserError);
  });

  it("says so on a browser without passkeys instead of throwing something else", async () => {
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true });

    expect(passkeysSupported()).toBe(false);
    const failure = await getPasskey({ challenge: "AQID" }).catch((error: unknown) => error);
    expect((failure as PasskeyBrowserError).reason).toBe("unsupported");
    expect(credentials.get).not.toHaveBeenCalled();
  });
});
