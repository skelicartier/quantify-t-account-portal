import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";
import type { RecoveryRequestAction } from "@/lib/auth/recovery";

vi.mock("@/components/auth/turnstile-field", () => ({
  TurnstileField: () => (
    <input type="hidden" name="cf-turnstile-response" value="turnstile-test-response" />
  ),
}));

describe("RecoveryRequestForm", () => {
  it("submits email and challenge then shows one generic accepted status", async () => {
    const user = userEvent.setup();
    const action = vi.fn<RecoveryRequestAction>().mockResolvedValue({
      status: "accepted",
      message: "If an account can use recovery, check that inbox for the next step.",
      fieldErrors: { email: [], challenge: [] },
    });

    render(<RecoveryRequestForm action={action} turnstileSiteKey="turnstile-public-key" />);

    const email = screen.getByRole("textbox", { name: /email address/i });
    expect(email).toHaveAttribute("autocomplete", "email");
    await user.type(email, "user@example.com");
    await user.click(screen.getByRole("button", { name: /send recovery email/i }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("check that inbox");
    expect(screen.queryByText(/account exists|not found/i)).not.toBeInTheDocument();
  });
});
