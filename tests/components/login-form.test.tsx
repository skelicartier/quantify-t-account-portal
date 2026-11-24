import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LoginForm } from "@/components/auth/login-form";
import type { LoginAction, LoginChallengeAction } from "@/lib/auth/login";

const idleChallenge = vi
  .fn<LoginChallengeAction>()
  .mockResolvedValue({ status: "idle", message: null, fieldErrors: { code: [] } });

vi.mock("@/components/auth/turnstile-field", () => ({
  TurnstileField: () => (
    <input type="hidden" name="cf-turnstile-response" value="turnstile-test-response" />
  ),
}));

describe("LoginForm", () => {
  it("submits accessible credentials and presents a generic authentication error", async () => {
    const user = userEvent.setup();
    const action = vi.fn<LoginAction>().mockResolvedValue({
      status: "error",
      message: "Unable to sign in with those credentials.",
      fieldErrors: { email: [], password: [], challenge: [] },
    });

    render(
      <LoginForm
        action={action}
        challengeAction={idleChallenge}
        nextPath="/account/security"
        turnstileSiteKey="turnstile-public-key"
      />,
    );

    const email = screen.getByRole("textbox", { name: /email address/i });
    const password = screen.getByLabelText(/^password$/i);
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();

    await user.type(email, "user@example.com");
    await user.type(password, "not-the-real-password");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]?.[1];
    expect(submitted).toBeInstanceOf(FormData);
    expect(submitted?.get("next")).toBe("/account/security");
    expect(submitted?.get("cf-turnstile-response")).toBe("turnstile-test-response");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign in with those credentials.",
    );
  });
  it("replaces the credential form with a code step when a second factor is required", async () => {
    const user = userEvent.setup();
    const action = vi.fn<LoginAction>().mockResolvedValue({
      status: "mfa-required",
      message: "Enter the 6-digit code from your authenticator app to finish signing in.",
      fieldErrors: { email: [], password: [], challenge: [] },
    });
    const challengeAction = vi.fn<LoginChallengeAction>().mockResolvedValue({
      status: "error",
      message: "That code is not valid. Try the current code from your authenticator app.",
      fieldErrors: { code: [] },
    });

    render(
      <LoginForm
        action={action}
        challengeAction={challengeAction}
        nextPath="/account/preferences"
        turnstileSiteKey="turnstile-public-key"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /email address/i }), "user@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    // The password step is gone: nothing on screen can re-post the credential.
    const code = await screen.findByRole("textbox", { name: /authenticator code/i });
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(code).toHaveAttribute("autocomplete", "one-time-code");

    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: /verify and continue/i }));

    await waitFor(() => expect(challengeAction).toHaveBeenCalledTimes(1));
    const submitted = challengeAction.mock.calls[0]?.[1];
    expect(submitted?.get("code")).toBe("123456");
    expect(submitted?.get("next")).toBe("/account/preferences");
    // The challenge submission carries no password material, and no factor id: the
    // action picks the factor from the provider, so a field here would be dead weight
    // that a schema could silently start depending on.
    expect(submitted?.get("password")).toBeNull();
    expect(submitted?.get("factorId")).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid.");
  });
});
