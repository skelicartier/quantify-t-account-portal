import { devAutologinPersona, isDevPersona } from "@/lib/auth/dev-bypass";

describe("the demo sign-in bypass", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on only in development, with a persona named, against a mock on this machine", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QT_ACCOUNT_API_URL", "http://localhost:7072/api/v1");
    vi.stubEnv("CONSOLE_DEV_AUTOLOGIN", "owner@example.test");
    expect(devAutologinPersona()).toBe("owner@example.test");
  });

  it("is off in a production build whatever the settings say", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QT_ACCOUNT_API_URL", "http://localhost:7072/api/v1");
    vi.stubEnv("CONSOLE_DEV_AUTOLOGIN", "owner@example.test");
    expect(devAutologinPersona()).toBeNull();
  });

  it("is off against any real service, so it can never sign in to a real account", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QT_ACCOUNT_API_URL", "https://account-api.example.com/api/v1");
    vi.stubEnv("CONSOLE_DEV_AUTOLOGIN", "owner@example.test");
    expect(devAutologinPersona()).toBeNull();
  });

  it("is off when no persona is named", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QT_ACCOUNT_API_URL", "http://127.0.0.1:7072/api/v1");
    vi.stubEnv("CONSOLE_DEV_AUTOLOGIN", "");
    expect(devAutologinPersona()).toBeNull();
  });

  it("knows its personas and no one else", () => {
    expect(isDevPersona("user@example.test")).toBe(true);
    expect(isDevPersona("someone@quantifyterminal.com")).toBe(false);
  });
});
