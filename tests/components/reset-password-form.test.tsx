import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { ResetPasswordAction } from "@/lib/auth/recovery";

describe("ResetPasswordForm", () => {
  it("submits matching new-password fields without rendering submitted secrets", async () => {
    const user = userEvent.setup();
    const action = vi.fn<ResetPasswordAction>().mockResolvedValue({
      status: "error",
      message: "Secure password update is temporarily unavailable. Please try again.",
      fieldErrors: { password: [], passwordConfirmation: [] },
    });

    render(<ResetPasswordForm action={action} />);

    const password = screen.getByLabelText(/^new password$/i);
    const confirmation = screen.getByLabelText(/confirm new password/i);
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(confirmation).toHaveAttribute("autocomplete", "new-password");

    await user.type(password, "new-password-value");
    await user.type(confirmation, "new-password-value");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).not.toHaveTextContent("new-password-value");
  });
});
