/**
 * The console has to say who it is calling on behalf of.
 *
 * The Account API limits sign-in, registration and recovery per source. It cannot work the
 * source out on its own for anything the console does: the console calls it from its own
 * server, so what the service observes is the console's egress — in production a rotating pool
 * of AWS addresses, none of them the person signing in. Read straight out of the service's own
 * `auth_events`, real sign-ins were recorded from 13.218.65.184, 35.171.153.94 and a dozen
 * more like them.
 *
 * Left that way, the per-source limits are wrong in both directions for every console user:
 * blind, because a thousand accounts tried from one browser look like ordinary console
 * traffic; and unfair, because `signup:ip` allows five an hour and five strangers who land on
 * the same egress address are five real customers turned away.
 *
 * So the header below is not a nicety. These tests exist because a header attached in one
 * place and forgotten in another is the ordinary way this regresses.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn() }));

vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { AzureAuthClient, CLIENT_ADDRESS_HEADER } from "@/lib/azure-auth-client";

function captureFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, user: {}, session: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.headers.mockReset();
});

describe("naming the person a proxied call is for", () => {
  it("forwards the platform's own view of the caller", () => {
    // `x-real-ip` is set by the platform and is the single address it saw, so it is preferred
    // over the client-supplied end of `x-forwarded-for`.
    mocks.headers.mockResolvedValue(
      new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 10.0.0.1" }),
    );
    const calls = captureFetch();

    return new AzureAuthClient("https://api.example/api/v1")
      .signIn("someone@example.test", "a-password")
      .then(() => {
        expect(headerOf(calls[0]!.init, CLIENT_ADDRESS_HEADER)).toBe("203.0.113.9");
      });
  });

  it("falls back to the first forwarded entry", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
    const calls = captureFetch();

    await new AzureAuthClient("https://api.example/api/v1").signIn("a@b.test", "p");

    expect(headerOf(calls[0]!.init, CLIENT_ADDRESS_HEADER)).toBe("203.0.113.9");
  });

  it("keeps the headers the call already had", async () => {
    // The failure mode of attaching a header by spreading: the content type disappears and
    // every request starts being rejected as malformed.
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "203.0.113.9" }));
    const calls = captureFetch();

    await new AzureAuthClient("https://api.example/api/v1").signUp("a@b.test", "p", "A", "B");

    expect(headerOf(calls[0]!.init, "Content-Type")).toBe("application/json");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("sends nothing when there is no request to read", async () => {
    // A build-time render or a test has no headers. Forwarding an empty or invented value
    // would be worse than forwarding nothing: the service falls back to what it observes.
    mocks.headers.mockRejectedValue(new Error("called outside a request scope"));
    const calls = captureFetch();

    await new AzureAuthClient("https://api.example/api/v1").signIn("a@b.test", "p");

    expect(headerOf(calls[0]!.init, CLIENT_ADDRESS_HEADER)).toBeUndefined();
  });

  it("sends nothing when the platform reported no address", async () => {
    mocks.headers.mockResolvedValue(new Headers({}));
    const calls = captureFetch();

    await new AzureAuthClient("https://api.example/api/v1").signIn("a@b.test", "p");

    expect(headerOf(calls[0]!.init, CLIENT_ADDRESS_HEADER)).toBeUndefined();
  });

  it("attaches it to every route, not only sign-in", async () => {
    // Recovery and registration are the two routes whose limits are about EMAIL, which is the
    // half that costs money and floods somebody's inbox. A header attached to sign-in alone
    // would leave exactly those unfixed.
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "203.0.113.9" }));
    const calls = captureFetch();
    const client = new AzureAuthClient("https://api.example/api/v1");

    await client.signIn("a@b.test", "p");
    await client.signUp("a@b.test", "p", "A", "B");
    await client.forgotPassword("a@b.test");
    await client.resetPassword("a-token", "a-new-password");
    await client.confirmEmail("a-token");

    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(headerOf(call.init, CLIENT_ADDRESS_HEADER), call.url).toBe("203.0.113.9");
    }
  });
});
