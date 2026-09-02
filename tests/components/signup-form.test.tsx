import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignupForm } from "@/components/auth/signup-form";
import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";
import type { SignupAction } from "@/lib/auth/signup";

vi.mock("@/components/auth/turnstile-field", () => ({
  TurnstileField: () => (
    <input type="hidden" name="cf-turnstile-response" value="turnstile-test-response" />
  ),
}));

describe("SignupForm", () => {
  it("submits only account credentials, explicit legal consent, and a challenge response", async () => {
    const user = userEvent.setup();
    const action = vi.fn<SignupAction>().mockResolvedValue({
      status: "accepted",
      message: "If this address can be registered, check your email for the next step.",
      fieldErrors: {
        email: [],
        password: [],
        passwordConfirmation: [],
        legalConsent: [],
        challenge: [],
      },
    });

    render(<SignupForm action={action} turnstileSiteKey="turnstile-public-key" />);

    const email = screen.getByRole("textbox", { name: /email address/i });
    const password = screen.getByLabelText(/^password$/i);
    const confirmation = screen.getByLabelText(/confirm password/i);
    const consent = screen.getByRole("checkbox", { name: /terms of service and privacy policy/i });

    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(confirmation).toHaveAttribute("autocomplete", "new-password");
    expect(consent).not.toBeChecked();
    expect(screen.queryByText(/\bpin\b/i)).not.toBeInTheDocument();

    await user.type(email, "new.user@example.com");
    await user.type(password, "twelve-character-password");
    await user.type(confirmation, "twelve-character-password");
    await user.click(consent);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = action.mock.calls[0]?.[1];
    expect(submitted?.get("email")).toBe("new.user@example.com");
    expect(submitted?.get("legalConsent")).toBe("on");
    expect(submitted?.get(CHALLENGE_FIELD_NAME)).toBe("turnstile-test-response");
    expect(await screen.findByRole("status")).toHaveTextContent("check your email");
  });
});
