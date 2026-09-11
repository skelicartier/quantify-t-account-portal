import {
  DESKTOP_CONNECT_RETURN_COOKIE,
  desktopConnectNextPath,
  desktopConnectPath,
  desktopConnectReturnCookie,
  isDesktopConnectNextPath,
  isDesktopConnectPath,
  loginPathForDesktopConnect,
  loopbackCallbackUrl,
  parseDesktopConnectParams,
  readDesktopConnectReturn,
} from "@/lib/auth/desktop-connect";

const STATE = "c2VjcmV0LXN0YXRlLWZyb20tdGhlLWFwcA";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const PATH = `/connect/desktop?state=${STATE}&port=53321&challenge=${CHALLENGE}`;

describe("desktop connect handoff", () => {
  it("parses a well-formed handoff from a query string or a form", () => {
    expect(
      parseDesktopConnectParams(
        new URLSearchParams({ state: STATE, port: "53321", challenge: CHALLENGE }),
      ),
    ).toEqual({ state: STATE, port: 53321, challenge: CHALLENGE });

    const formData = new FormData();
    formData.set("state", STATE);
    formData.set("port", "1024");
    formData.set("challenge", CHALLENGE);
    expect(parseDesktopConnectParams(formData)?.port).toBe(1024);
  });

  it.each([
    ["missing state", { port: "53321", challenge: CHALLENGE }],
    ["short state", { state: "abc", port: "53321", challenge: CHALLENGE }],
    ["padded state", { state: `${STATE}==`, port: "53321", challenge: CHALLENGE }],
    ["privileged port", { state: STATE, port: "443", challenge: CHALLENGE }],
    ["port above range", { state: STATE, port: "65536", challenge: CHALLENGE }],
    ["non-numeric port", { state: STATE, port: "53321x", challenge: CHALLENGE }],
    ["short challenge", { state: STATE, port: "53321", challenge: CHALLENGE.slice(1) }],
    [
      "challenge with a slash",
      { state: STATE, port: "53321", challenge: `${CHALLENGE.slice(0, 42)}/` },
    ],
  ])("refuses a handoff with a %s", (_label, params) => {
    expect(parseDesktopConnectParams(new URLSearchParams(params))).toBeNull();
  });

  it("refuses repeated parameters", () => {
    const params = new URLSearchParams({ state: STATE, port: "53321", challenge: CHALLENGE });
    params.append("port", "53322");

    expect(parseDesktopConnectParams(params)).toBeNull();
  });

  it("builds the canonical page path and recognises it as a return destination", () => {
    const path = desktopConnectPath({ state: STATE, port: 53321, challenge: CHALLENGE });

    expect(path).toBe(PATH);
    expect(isDesktopConnectNextPath(path)).toBe(true);
    expect(isDesktopConnectNextPath("/account")).toBe(false);
    expect(isDesktopConnectPath("/connect/desktop")).toBe(true);
    expect(isDesktopConnectPath("/connect/desktop/")).toBe(false);
    expect(isDesktopConnectPath("/connect/desktops")).toBe(false);
  });

  it("canonicalises an untrusted next value only when it is a valid handoff", () => {
    expect(desktopConnectNextPath(`${PATH}&extra=1`)).toBe(PATH);
    expect(
      desktopConnectNextPath(`/connect/desktop?port=53321&challenge=${CHALLENGE}&state=${STATE}`),
    ).toBe(PATH);
    expect(desktopConnectNextPath("/connect/desktop")).toBeNull();
    expect(
      desktopConnectNextPath(`/connect/desktop?state=${STATE}&port=80&challenge=${CHALLENGE}`),
    ).toBeNull();
    expect(desktopConnectNextPath(`https://evil.example${PATH}`)).toBeNull();
    expect(desktopConnectNextPath(`//evil.example${PATH}`)).toBeNull();
    expect(desktopConnectNextPath("/account")).toBeNull();
    expect(desktopConnectNextPath(null)).toBeNull();
  });

  it("only ever sends the browser to the loopback listener", () => {
    const url = new URL(loopbackCallbackUrl(53321, "one-time code&x", STATE));

    expect(url.origin).toBe("http://127.0.0.1:53321");
    expect(url.pathname).toBe("/callback");
    expect(url.searchParams.get("code")).toBe("one-time code&x");
    expect(url.searchParams.get("state")).toBe(STATE);
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
