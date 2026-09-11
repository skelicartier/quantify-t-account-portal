import {
  DESKTOP_CONNECT_RETURN_COOKIE,
  desktopConnectNextPath,
  desktopConnectPath,
  desktopConnectReturnCookie,
  isDesktopConnectNextPath,
  isDesktopConnectPath,
  loginPathForDesktopConnect,
  parseDesktopConnectParams,
  readDesktopConnectReturn,
} from "@/lib/auth/desktop-connect";

const HANDOFF = "c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
const PATH = `/connect/desktop?handoff=${HANDOFF}`;

describe("desktop connect handoff", () => {
  it("parses a well-formed handoff id from a query string or a form", () => {
    expect(parseDesktopConnectParams(new URLSearchParams({ handoff: HANDOFF }))).toEqual({
      handoff: HANDOFF,
    });

    const formData = new FormData();
    formData.set("handoff", HANDOFF);
    expect(parseDesktopConnectParams(formData)).toEqual({ handoff: HANDOFF });
  });

  it.each([
    ["missing id", {}],
    ["short id", { handoff: "abc" }],
    ["padded id", { handoff: `${HANDOFF}==` }],
    ["id with a slash", { handoff: `${HANDOFF.slice(0, 40)}/ab` }],
    ["overlong id", { handoff: "a".repeat(129) }],
    ["legacy loopback parameters", { state: HANDOFF, port: "53321", challenge: "c".repeat(43) }],
  ])("refuses a handoff with a %s", (_label, params) => {
    expect(parseDesktopConnectParams(new URLSearchParams(params))).toBeNull();
  });

  it("refuses a repeated parameter", () => {
    const params = new URLSearchParams({ handoff: HANDOFF });
    params.append("handoff", HANDOFF);

    expect(parseDesktopConnectParams(params)).toBeNull();
  });

  it("builds the canonical page path and recognises it as a return destination", () => {
    const path = desktopConnectPath({ handoff: HANDOFF });

    expect(path).toBe(PATH);
    expect(isDesktopConnectNextPath(path)).toBe(true);
    expect(isDesktopConnectNextPath("/account")).toBe(false);
    expect(isDesktopConnectPath("/connect/desktop")).toBe(true);
    expect(isDesktopConnectPath("/connect/desktop/")).toBe(false);
    expect(isDesktopConnectPath("/connect/desktops")).toBe(false);
  });

  it("canonicalises an untrusted next value only when it is a valid handoff", () => {
    expect(desktopConnectNextPath(`${PATH}&extra=1`)).toBe(PATH);
    expect(desktopConnectNextPath("/connect/desktop")).toBeNull();
    expect(desktopConnectNextPath("/connect/desktop?handoff=short")).toBeNull();
    expect(desktopConnectNextPath(`https://evil.example${PATH}`)).toBeNull();
    expect(desktopConnectNextPath(`//evil.example${PATH}`)).toBeNull();
    expect(desktopConnectNextPath("/account")).toBeNull();
    expect(desktopConnectNextPath(null)).toBeNull();
  });

  it("never names a loopback or port anywhere in the contract", () => {
    const sources = Object.entries({
      desktopConnectPath,
      desktopConnectNextPath,
      loginPathForDesktopConnect,
    }).map(([, fn]) => fn.toString());
    for (const source of sources) {
      expect(source).not.toMatch(/127\.0\.0\.1|localhost|callback|port/u);
    }
  });

  it("carries the handoff into the sign-in URL", () => {
    const url = new URL(loginPathForDesktopConnect(PATH), "https://console.example");

    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe(PATH);
  });

  it("round-trips the handoff through the return cookie and clears it", () => {
    const cookie = desktopConnectReturnCookie(PATH, { secure: true });
    expect(cookie).toMatch(/^qt-connect-return=/u);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=1800");

    const pair = cookie.split(";")[0];
    expect(readDesktopConnectReturn(`other=1; ${pair}; theme=dark`)).toBe(PATH);
    expect(readDesktopConnectReturn(`${DESKTOP_CONNECT_RETURN_COOKIE}=%2Faccount`)).toBeNull();
    expect(readDesktopConnectReturn(`${DESKTOP_CONNECT_RETURN_COOKIE}=%E0%A4%A`)).toBeNull();
    expect(readDesktopConnectReturn("theme=dark")).toBeNull();
    expect(readDesktopConnectReturn(null)).toBeNull();

    const cleared = desktopConnectReturnCookie(null, { secure: false });
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).not.toContain("Secure");
  });
});
