/**
 * Where the console learns an account's access status: `me` first — the summary every page
 * already loads, read from the database the way the access gate reads it — and the account
 * overview from `auth/user` only when `me` says nothing.
 */

const mocks = vi.hoisted(() => ({
  getAccountAccessStatus: vi.fn(),
  getCurrentAccount: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({ getAccountAccessStatus: mocks.getAccountAccessStatus }));
vi.mock("@/lib/dal/account", () => ({ getCurrentAccount: mocks.getCurrentAccount }));

async function load() {
  vi.resetModules();
  return (await import("@/lib/dal/access")).getCurrentAccessHold;
}

beforeEach(() => vi.clearAllMocks());

describe("getCurrentAccessHold", () => {
  it("takes the status from me, without reading the account overview", async () => {
    mocks.getAccountAccessStatus.mockResolvedValue("declined");
    const getCurrentAccessHold = await load();

    await expect(getCurrentAccessHold()).resolves.toBe("declined");
    expect(mocks.getCurrentAccount).not.toHaveBeenCalled();
  });

  it("holds nothing back when me says the account is approved", async () => {
    mocks.getAccountAccessStatus.mockResolvedValue("approved");
    mocks.getCurrentAccount.mockResolvedValue({ accessStatus: "pending" });
    const getCurrentAccessHold = await load();

    // `me` is the gate's own reading; an older copy elsewhere does not overrule it.
    await expect(getCurrentAccessHold()).resolves.toBeNull();
    expect(mocks.getCurrentAccount).not.toHaveBeenCalled();
  });

  it("falls back to the overview when me carries no status", async () => {
    mocks.getAccountAccessStatus.mockResolvedValue(null);
    mocks.getCurrentAccount.mockResolvedValue({ accessStatus: "pending" });
    const getCurrentAccessHold = await load();

    await expect(getCurrentAccessHold()).resolves.toBe("pending");
  });

  it("says nothing, rather than throwing, when neither can be read", async () => {
    mocks.getAccountAccessStatus.mockResolvedValue(null);
    mocks.getCurrentAccount.mockRejectedValue(new Error("outage"));
    const getCurrentAccessHold = await load();

    await expect(getCurrentAccessHold()).resolves.toBeNull();
  });
});
