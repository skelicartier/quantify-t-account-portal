import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LoginForm } from "@/components/auth/login-form";
import type { LoginAction } from "@/lib/auth/login";

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
        nextPath="/account/security"
        turnstileSiteKey="turnstile-public-key"
      />,
    );

    const email = screen.getByRole("textbox", { name: /email address/i });
    const password = screen.getByLabelText(/^password$/i);
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: /sign in securely/i })).toBeEnabled();

    await user.type(email, "user@example.com");
    await user.type(password, "not-the-real-password");
    await user.click(screen.getByRole("button", { name: /sign in securely/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]?.[1];
    expect(submitted).toBeInstanceOf(FormData);
    expect(submitted?.get("next")).toBe("/account/security");
    expect(submitted?.get("cf-turnstile-response")).toBe("turnstile-test-response");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign in with those credentials.",
    );
  });
});
