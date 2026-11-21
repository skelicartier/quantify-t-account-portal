import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  addPasskey: vi.fn(),
  removePasskey: vi.fn(),
  provePasskey: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/passkeys/ceremony", () => ({
  addPasskey: mocks.addPasskey,
  removePasskey: mocks.removePasskey,
  provePasskey: mocks.provePasskey,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace, push: vi.fn(), prefetch: vi.fn() }),
}));

import { PasskeyPanel } from "@/components/account/passkey-panel";
import { AdminPasskeyNotice } from "@/components/admin/admin-passkey-notice";
import { PasskeyConfirm } from "@/components/passkeys/passkey-confirm";
import type { PasskeyListItem, PasskeyState } from "@/lib/passkeys/state";

const NOW = Date.parse("2026-11-21T12:00:00Z");

function state(overrides: Partial<PasskeyState> = {}): PasskeyState {
  return {
    mode: "when-enrolled",
    staff: true,
    enrolled: false,
    count: 0,
    required: false,
    verified: false,
    fresh: false,
    verifiedUntil: null,
    freshUntil: null,
    ...overrides,
  };
}

const LAPTOP: PasskeyListItem = {
  id: "0b6f8a52-1111-4222-8333-444455556666",
  name: "MacBook Touch ID",
  createdAt: "2026-11-20T12:00:00Z",
  lastUsedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addPasskey.mockResolvedValue({ status: "ok", value: null });
  mocks.removePasskey.mockResolvedValue({ status: "ok", value: null });
  mocks.provePasskey.mockResolvedValue({ status: "ok", value: null });
});

describe("PasskeyPanel", () => {
  it("tells a staff account with none what its password alone opens", () => {
    render(<PasskeyPanel passkeys={[]} state={state()} maxPasskeys={10} now={NOW} />);

    expect(screen.getByText("Off")).toBeVisible();
    expect(screen.getByText(/your password alone opens administration/i)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeEnabled();
  });

  it("adds one with the name and the current password, then reloads the page", async () => {
    const user = userEvent.setup();
    render(<PasskeyPanel passkeys={[]} state={state()} maxPasskeys={10} now={NOW} />);

    await user.type(screen.getByLabelText("Name for this device"), "MacBook Touch ID");
    await user.type(screen.getByLabelText("Current password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));

    expect(mocks.addPasskey).toHaveBeenCalledWith({ password: "correct horse", name: "MacBook Touch ID" });
    expect(await screen.findByRole("status")).toHaveTextContent(/passkey added/i);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("asks for the password before it bothers the device", async () => {
    const user = userEvent.setup();
    render(<PasskeyPanel passkeys={[]} state={state()} maxPasskeys={10} now={NOW} />);

    await user.click(screen.getByRole("button", { name: "Add a passkey" }));

    expect(mocks.addPasskey).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your current password.")).toBeVisible();
  });

  it("puts a wrong password on the password field and anything else in an alert", async () => {
    const user = userEvent.setup();
    mocks.addPasskey.mockResolvedValueOnce({
      status: "error",
      reason: "password",
      message: "That password is not correct.",
    });
    render(<PasskeyPanel passkeys={[]} state={state()} maxPasskeys={10} now={NOW} />);

    await user.type(screen.getByLabelText("Current password"), "nope");
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(await screen.findByText("That password is not correct.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();

    mocks.addPasskey.mockResolvedValueOnce({
      status: "error",
      reason: "refused",
      message: "The passkey prompt was dismissed or timed out. Nothing changed; try again.",
    });
    await user.type(screen.getByLabelText("Current password"), "right");
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/dismissed or timed out/u);
  });

  it("lists what the account holds and removes one only after a second, deliberate press", async () => {
    const user = userEvent.setup();
    render(
      <PasskeyPanel
        passkeys={[LAPTOP]}
        state={state({ enrolled: true, count: 1, required: true, verified: true, fresh: true })}
        maxPasskeys={10}
        now={NOW}
      />,
    );

    const row = within(screen.getByRole("table")).getByText("MacBook Touch ID").closest("tr")!;
    expect(within(row).getByText("Not yet")).toBeVisible();
    await user.click(within(row).getByRole("button", { name: "Remove MacBook Touch ID" }));
    expect(mocks.removePasskey).not.toHaveBeenCalled();

    await user.click(within(row).getByRole("button", { name: "Keep" }));
    expect(within(row).getByRole("button", { name: "Remove MacBook Touch ID" })).toBeVisible();

    await user.click(within(row).getByRole("button", { name: "Remove MacBook Touch ID" }));
    await user.click(within(row).getByRole("button", { name: "Remove it" }));

    expect(mocks.removePasskey).toHaveBeenCalledWith(LAPTOP.id);
    expect(await screen.findByRole("status")).toHaveTextContent("Removed MacBook Touch ID.");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("offers no form once the account holds as many as it can", () => {
    render(
      <PasskeyPanel
        passkeys={[LAPTOP]}
        state={state({ enrolled: true, count: 1 })}
        maxPasskeys={1}
        now={NOW}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add a passkey" })).not.toBeInTheDocument();
    expect(screen.getByText(/remove one to add another/i)).toBeVisible();
  });

  it("offers nothing at all when the service could not say what the account holds", () => {
    render(<PasskeyPanel passkeys={[]} state={null} maxPasskeys={10} now={NOW} />);

    expect(screen.getByRole("status")).toHaveTextContent(/could not be read/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PasskeyConfirm", () => {
  it("reloads what the page shows once the device's answer is accepted", async () => {
    const user = userEvent.setup();
    render(<PasskeyConfirm />);

    await user.click(screen.getByRole("button", { name: "Confirm with passkey" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.replace).not.toHaveBeenCalled();
    // Still busy: the page behind is on its way and a second press would only ask again.
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("goes where it was told to once confirmed", async () => {
    const user = userEvent.setup();
    render(<PasskeyConfirm label="Use passkey" href="/admin/users" />);

    await user.click(screen.getByRole("button", { name: "Use passkey" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/users"));
  });

  it("says why not and lets the person try again", async () => {
    const user = userEvent.setup();
    mocks.provePasskey.mockResolvedValueOnce({
      status: "error",
      reason: "refused",
      message: "That passkey was not accepted. Try again, or use another one.",
    });
    render(<PasskeyConfirm />);

    await user.click(screen.getByRole("button", { name: "Confirm with passkey" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not accepted/u);
    expect(screen.getByRole("button", { name: "Confirm with passkey" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("AdminPasskeyNotice", () => {
  it("tells a staff account with no passkey what stands in front of Administration", () => {
    render(<AdminPasskeyNotice passkey={state()} />);

    expect(screen.getByRole("status")).toHaveTextContent(/password alone opens administration/i);
    expect(screen.getByRole("link", { name: "Add a passkey" })).toHaveAttribute(
      "href",
      "/account/security#security-passkeys-heading",
    );
  });

  it("offers the prompt before a change is attempted when the confirmation is no longer recent", () => {
    render(
      <AdminPasskeyNotice
        passkey={state({ enrolled: true, count: 1, required: true, verified: true, fresh: false })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/needs your passkey again/i);
    expect(screen.getByRole("button", { name: "Confirm with passkey" })).toBeEnabled();
  });

  it("says until when changes are open", () => {
    render(
      <AdminPasskeyNotice
        passkey={state({
          enrolled: true,
          count: 1,
          required: true,
          verified: true,
          fresh: true,
          freshUntil: "2026-11-21T12:15:00Z",
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/changes are open until/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["nothing was read", null],
    ["the factor is switched off", state({ mode: "off" })],
    ["the account is not staff", state({ staff: false, enrolled: true, count: 1 })],
    ["the pages themselves are shut", state({ mode: "required" })],
    ["the session has not proved it yet", state({ enrolled: true, count: 1, required: true })],
  ])("says nothing when %s", (_label, passkey) => {
    const { container } = render(<AdminPasskeyNotice passkey={passkey} />);

    expect(container).toBeEmptyDOMElement();
  });
});
