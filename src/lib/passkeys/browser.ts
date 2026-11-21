/**
 * The browser half of a passkey ceremony.
 *
 * The Account API sends the options in the standard JSON form (base64url where the
 * browser wants bytes) and takes back the browser's answer in the same form. This module
 * converts in both directions and turns the browser's own errors into one sentence a
 * person can act on. It decides nothing: the service checks every byte it is handed.
 */

export class PasskeyBrowserError extends Error {
  readonly reason: "unsupported" | "cancelled" | "exists" | "address" | "failed";

  constructor(reason: PasskeyBrowserError["reason"], message: string) {
    super(message);
    this.name = "PasskeyBrowserError";
    this.reason = reason;
  }
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64Url(value: ArrayBuffer | ArrayBufferView | null | undefined): string {
  if (!value) return "";
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

type JsonRecord = Readonly<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function descriptors(value: unknown): PublicKeyCredentialDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => record(item))
    .filter((item) => text(item.id) !== "")
    .map((item) => ({ type: "public-key" as const, id: base64UrlToBytes(text(item.id)) }));
}

export function creationOptionsFromJson(json: JsonRecord): PublicKeyCredentialCreationOptions {
  const rp = record(json.rp);
  const user = record(json.user);
  const selection = record(json.authenticatorSelection);
  const params = Array.isArray(json.pubKeyCredParams) ? json.pubKeyCredParams : [];
  return {
    challenge: base64UrlToBytes(text(json.challenge)),
    rp: { id: text(rp.id), name: text(rp.name) || "Quantify Terminal" },
    user: {
      id: base64UrlToBytes(text(user.id)),
      name: text(user.name),
      displayName: text(user.displayName) || text(user.name),
    },
    pubKeyCredParams: params
      .map((item) => record(item))
      .filter((item) => typeof item.alg === "number")
      .map((item) => ({ type: "public-key" as const, alg: item.alg as number })),
    timeout: typeof json.timeout === "number" ? json.timeout : 120_000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: selection.residentKey === "required" ? "required" : "preferred",
      // Never weaker than the service asked for: the device must check the person.
      userVerification: "required",
    },
    excludeCredentials: descriptors(json.excludeCredentials),
  };
}

export function requestOptionsFromJson(json: JsonRecord): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToBytes(text(json.challenge)),
    rpId: text(json.rpId),
    timeout: typeof json.timeout === "number" ? json.timeout : 120_000,
    userVerification: "required",
    allowCredentials: descriptors(json.allowCredentials),
  };
}

function explain(error: unknown, ceremony: "create" | "get"): PasskeyBrowserError {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") {
    return new PasskeyBrowserError(
      "cancelled",
      "The passkey prompt was dismissed or timed out. Nothing changed; try again.",
    );
  }
  if (name === "InvalidStateError" && ceremony === "create") {
    return new PasskeyBrowserError(
      "exists",
      "This device already holds a passkey for this account.",
    );
  }
  if (name === "SecurityError") {
    return new PasskeyBrowserError(
      "address",
      "Passkeys cannot be used at this address. Open the console at its own address.",
    );
  }
  return new PasskeyBrowserError(
    "failed",
    "This device could not complete the passkey step. Try again, or use another device.",
  );
}

function unsupported(): PasskeyBrowserError {
  return new PasskeyBrowserError(
    "unsupported",
    "This browser does not support passkeys. Use a current Safari, Chrome, Edge or Firefox.",
  );
}

/** Make a passkey on this device. Resolves with what the service's register route takes. */
export async function createPasskey(publicKey: JsonRecord): Promise<Record<string, unknown>> {
  if (!passkeysSupported()) throw unsupported();
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({
      publicKey: creationOptionsFromJson(publicKey),
    });
  } catch (error) {
    throw explain(error, "create");
  }
  const made = credential as PublicKeyCredential | null;
  const response = made?.response as AuthenticatorAttestationResponse | undefined;
  if (!made || !response?.attestationObject) throw explain(null, "create");
  return {
    id: made.id,
    rawId: bytesToBase64Url(made.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      attestationObject: bytesToBase64Url(response.attestationObject),
    },
  };
}

/** Prove a passkey this account already has. Resolves with what the verify route takes. */
export async function getPasskey(publicKey: JsonRecord): Promise<Record<string, unknown>> {
  if (!passkeysSupported()) throw unsupported();
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({ publicKey: requestOptionsFromJson(publicKey) });
  } catch (error) {
    throw explain(error, "get");
  }
  const used = credential as PublicKeyCredential | null;
  const response = used?.response as AuthenticatorAssertionResponse | undefined;
  if (!used || !response?.signature) throw explain(null, "get");
  return {
    id: used.id,
    rawId: bytesToBase64Url(used.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      authenticatorData: bytesToBase64Url(response.authenticatorData),
      signature: bytesToBase64Url(response.signature),
    },
  };
}
