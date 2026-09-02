import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EmailChangeForm } from "@/components/account/email-change-form";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { TwoFactorPanel } from "@/components/account/two-factor-panel";
import { PASSWORD_MINIMUM_LENGTH } from "@/lib/auth/password-policy";
import {
  INITIAL_EMAIL_CHANGE_STATE,
  INITIAL_PASSWORD_CHANGE_STATE,
  INITIAL_TOTP_ENROLLMENT_STATE,
  type EmailChangeActionState,
  type PasswordChangeActionState,
  type TotpEnrollmentState,
} from "@/lib/auth/security-input";

type TotpAction = (state: TotpEnrollmentState, formData: FormData) => Promise<TotpEnrollmentState>;

const idleTotp = () => vi.fn<TotpAction>(async () => INITIAL_TOTP_ENROLLMENT_STATE);

describe("password change form", () => {
  it("requires the current password alongside a policy-compliant new password", async () => {
    const user = userEvent.setup();
    const action = vi.fn<
      (state: PasswordChangeActionState, formData: FormData) => Promise<PasswordChangeActionState>
    >(async () => INITIAL_PASSWORD_CHANGE_STATE);

    render(<PasswordChangeForm action={action} />);

    const current = screen.getByLabelText(/current password/i);
    const next = screen.getByLabelText(/^new password$/i);
    const confirmation = screen.getByLabelText(/confirm new password/i);

    expect(current).toHaveAttribute("type", "password");
    expect(current).toHaveAttribute("autocomplete", "current-password");
    expect(next).toHaveAttribute("autocomplete", "new-password");
    expect(next).toHaveAttribute("minlength", String(PASSWORD_MINIMUM_LENGTH));

    await user.type(current, "old-password-value");
    await user.type(next, "correct-horse-battery-staple");
    await user.type(confirmation, "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]![1];
    expect(submitted.get("currentPassword")).toBe("old-password-value");
    expect(submitted.get("password")).toBe("correct-horse-battery-staple");
  });

  it("announces a rejected current password as an alert", async () => {
    const user = userEvent.setup();
    const action = vi.fn<
      (state: PasswordChangeActionState, formData: FormData) => Promise<PasswordChangeActionState>
    >(async () => ({
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        currentPassword: ["That password is not correct."],
        password: [],
        passwordConfirmation: [],
      },
    }));

    render(<PasswordChangeForm action={action} />);
    await user.type(screen.getByLabelText(/current password/i), "wrong");
    await user.type(screen.getByLabelText(/^new password$/i), "correct-horse-battery-staple");
    await user.type(screen.getByLabelText(/confirm new password/i), "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields");
    expect(screen.getByText("That password is not correct.")).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("email change form", () => {
  it("shows the current address read-only and requires the password to request a change", async () => {
    const user = userEvent.setup();
    const action = vi.fn<
      (state: EmailChangeActionState, formData: FormData) => Promise<EmailChangeActionState>
    >(async () => INITIAL_EMAIL_CHANGE_STATE);

    render(<EmailChangeForm currentEmail="user@example.com" action={action} />);

    const current = screen.getByLabelText(/current verified email/i);
    expect(current).toHaveValue("user@example.com");
    expect(current).toBeDisabled();

    await user.type(screen.getByLabelText(/new email address/i), "new@example.com");
    await user.type(screen.getByLabelText(/current password/i), "old-password-value");
    await user.click(screen.getByRole("button", { name: /request email change/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]![1];
    expect(submitted.get("email")).toBe("new@example.com");
    expect(submitted.get("currentPassword")).toBe("old-password-value");
  });

  it("states that both inboxes must confirm", () => {
    render(
      <EmailChangeForm
        currentEmail="user@example.com"
        action={vi.fn<
          (state: EmailChangeActionState, formData: FormData) => Promise<EmailChangeActionState>
        >(async () => INITIAL_EMAIL_CHANGE_STATE)}
      />,
    );

    expect(screen.getByText(/both your current and new address must confirm/i)).toBeInTheDocument();
  });
});

describe("two-factor panel", () => {
  it("offers enrollment when no verified factor exists", () => {
    render(
      <TwoFactorPanel
        factors={[]}
        currentLevel="aal1"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={idleTotp()}
      />,
    );

    expect(screen.getByText(/password only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up an authenticator app/i })).toBeEnabled();
    expect(screen.queryByLabelText(/authenticator code/i)).not.toBeInTheDocument();
    // Adding a factor raises the required level for every session, so it asks for the
    // current password exactly like removing one does.
    expect(screen.getByLabelText(/current password, to set up an authenticator/i)).toBeRequired();
  });

  it("submits the current password when enrollment starts", async () => {
    const user = userEvent.setup();
    const startEnrollment = vi.fn<TotpAction>(async () => INITIAL_TOTP_ENROLLMENT_STATE);

    render(
      <TwoFactorPanel
        factors={[]}
        currentLevel="aal1"
        factorsReadable
        startEnrollment={startEnrollment}
        confirmEnrollment={idleTotp()}
        removeFactor={idleTotp()}
      />,
    );

    await user.type(
      screen.getByLabelText(/current password, to set up an authenticator/i),
      "old-password-value",
    );
    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));

    await waitFor(() => expect(startEnrollment).toHaveBeenCalledTimes(1));
    expect(startEnrollment.mock.calls[0]![1].get("currentPassword")).toBe("old-password-value");
  });

  it("offers a removal control for every enrolled factor, each carrying its own id", async () => {
    const user = userEvent.setup();
    const removeFactor = vi.fn<TotpAction>(async () => INITIAL_TOTP_ENROLLMENT_STATE);

    render(
      <TwoFactorPanel
        factors={[
          { id: "factor-first", friendlyName: "Phone", createdAt: "2026-09-01" },
          { id: "factor-second", friendlyName: "Backup", createdAt: "2026-09-02" },
        ]}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={removeFactor}
      />,
    );

    const controls = screen.getAllByRole("button", { name: /remove authenticator/i });
    expect(controls).toHaveLength(2);

    // The second factor must be removable, not just the first one rendered.
    await user.type(screen.getByLabelText(/current password, to remove backup/i), "old-password");
    await user.click(controls[1]!);

    await waitFor(() => expect(removeFactor).toHaveBeenCalledTimes(1));
    expect(removeFactor.mock.calls[0]![1].get("factorId")).toBe("factor-second");
  });

  it("shows the QR code and manual key after enrollment starts, then submits the code", async () => {
    const user = userEvent.setup();
    const startEnrollment = vi.fn<TotpAction>(async () => ({
      status: "pending-verification",
      message: "Scan the code in your authenticator app, then enter the code it shows.",
      factorId: "factor-new",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "SECRETVALUE",
      fieldErrors: { code: [], currentPassword: [] },
    }));
    const confirmEnrollment = vi.fn<TotpAction>(async () => INITIAL_TOTP_ENROLLMENT_STATE);

    render(
      <TwoFactorPanel
        factors={[]}
        currentLevel="aal1"
        factorsReadable
        startEnrollment={startEnrollment}
        confirmEnrollment={confirmEnrollment}
        removeFactor={idleTotp()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));

    const qr = await screen.findByRole("img", { name: /qr code for enrolling/i });
    expect(qr).toHaveAttribute("src", "data:image/svg+xml;utf-8,<svg/>");
    expect(screen.getByText("SECRETVALUE")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/authenticator code/i), "123456");
    await user.click(screen.getByRole("button", { name: /turn on two-factor/i }));

    await waitFor(() => expect(confirmEnrollment).toHaveBeenCalledTimes(1));
    const submitted = confirmEnrollment.mock.calls[0]![1];
    expect(submitted.get("code")).toBe("123456");
    expect(submitted.get("factorId")).toBe("factor-new");
  });

  it("requires the current password to remove an enrolled factor", async () => {
    const user = userEvent.setup();
    const removeFactor = vi.fn<TotpAction>(async () => INITIAL_TOTP_ENROLLMENT_STATE);

    render(
      <TwoFactorPanel
        factors={[{ id: "factor-verified", friendlyName: "Phone", createdAt: "2026-09-01" }]}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={removeFactor}
      />,
    );

    expect(screen.getByText(/two-factor authentication is on/i)).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    // Enrollment is not offered again while a verified factor exists.
    expect(
      screen.queryByRole("button", { name: /set up an authenticator app/i }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/current password, to remove phone/i),
      "old-password-value",
    );
    await user.click(screen.getByRole("button", { name: /remove authenticator/i }));

    await waitFor(() => expect(removeFactor).toHaveBeenCalledTimes(1));
    const submitted = removeFactor.mock.calls[0]![1];
    expect(submitted.get("currentPassword")).toBe("old-password-value");
    expect(submitted.get("factorId")).toBe("factor-verified");
  });

  it("reports two-factor status as unavailable rather than as password-only", () => {
    render(
      <TwoFactorPanel
        factors={[]}
        currentLevel="aal1"
        factorsReadable={false}
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={idleTotp()}
      />,
    );

    // "Password only" would be a statement about the account; the failure is about
    // this request, and nothing here may be changed while it cannot be read.
    expect(screen.queryByText(/password only/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /set up an authenticator app/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
  });

  it("keeps the enrollment confirmation visible after the factor list refreshes", async () => {
    const user = userEvent.setup();
    const startEnrollment = vi.fn<TotpAction>(async () => ({
      status: "pending-verification",
      message: null,
      factorId: "factor-new",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "SECRETVALUE",
      fieldErrors: { code: [], currentPassword: [] },
    }));
    const confirmEnrollment = vi.fn<TotpAction>(async () => ({
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "success",
      // The real action reports which factor it confirmed, which is how the panel tells
      // a completed enrollment from a newly started one.
      factorId: "factor-new",
      message: "Two-factor authentication is on. You will be asked for a code at every sign-in.",
    }));
    const panel = (
      factors: Array<{ id: string; friendlyName: string | null; createdAt: string | null }>,
    ) => (
      <TwoFactorPanel
        factors={factors}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={startEnrollment}
        confirmEnrollment={confirmEnrollment}
        removeFactor={idleTotp()}
      />
    );

    const { rerender } = render(panel([]));

    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));
    await user.type(await screen.findByLabelText(/authenticator code/i), "123456");
    await user.click(screen.getByRole("button", { name: /turn on two-factor/i }));
    await waitFor(() => expect(confirmEnrollment).toHaveBeenCalledTimes(1));

    // Confirming revalidates the page, so the panel re-renders with the new factor and
    // switches branches. A message rendered only in the setup branch would vanish here.
    rerender(panel([{ id: "factor-verified", friendlyName: "Phone", createdAt: "2026-09-01" }]));

    expect(await screen.findByText(/two-factor authentication is on\./i)).toBeInTheDocument();
  });

  it("keeps the removal confirmation visible after the factor list refreshes", async () => {
    const user = userEvent.setup();
    const removeFactor = vi.fn<TotpAction>(async () => ({
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "success",
      message: "Authenticator removed. Sign-in now requires only your password.",
    }));
    const panel = (
      factors: Array<{ id: string; friendlyName: string | null; createdAt: string | null }>,
    ) => (
      <TwoFactorPanel
        factors={factors}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={removeFactor}
      />
    );

    const { rerender } = render(
      panel([{ id: "factor-verified", friendlyName: "Phone", createdAt: "2026-09-01" }]),
    );

    await user.type(screen.getByLabelText(/current password, to remove phone/i), "old-password");
    await user.click(screen.getByRole("button", { name: /remove authenticator/i }));
    await waitFor(() => expect(removeFactor).toHaveBeenCalledTimes(1));

    // Removal revalidates the page, so the factor and its form disappear. A state owned
    // by that form would unmount with it and the owner would see no confirmation.
    rerender(panel([]));

    expect(await screen.findByText(/authenticator removed/i)).toBeInTheDocument();
    expect(screen.getByText(/password only/i)).toBeInTheDocument();
  });

  it("does not assert two-factor is on after an enroll then remove in one page instance", async () => {
    const user = userEvent.setup();
    const startEnrollment = vi.fn<TotpAction>(async () => ({
      status: "pending-verification",
      message: null,
      factorId: "factor-new",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "SECRETVALUE",
      fieldErrors: { code: [], currentPassword: [] },
    }));
    const confirmEnrollment = vi.fn<TotpAction>(async () => ({
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "success",
      // The real action reports which factor it confirmed, which is how the panel tells
      // a completed enrollment from a newly started one.
      factorId: "factor-new",
      message: "Two-factor authentication is on. You will be asked for a code at every sign-in.",
    }));
    const panel = (
      factors: Array<{ id: string; friendlyName: string | null; createdAt: string | null }>,
    ) => (
      <TwoFactorPanel
        factors={factors}
        currentLevel="aal1"
        factorsReadable
        startEnrollment={startEnrollment}
        confirmEnrollment={confirmEnrollment}
        removeFactor={idleTotp()}
      />
    );

    const { rerender } = render(panel([]));
    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));
    await user.type(await screen.findByLabelText(/authenticator code/i), "123456");
    await user.click(screen.getByRole("button", { name: /turn on two-factor/i }));
    await waitFor(() => expect(confirmEnrollment).toHaveBeenCalledTimes(1));

    rerender(panel([{ id: "factor-verified", friendlyName: "Phone", createdAt: "2026-09-01" }]));
    expect(await screen.findByText(/two-factor authentication is on\./i)).toBeInTheDocument();

    // Then the factor is removed and the list empties again: stale copy claiming a
    // factor is required must not sit under a "Password only" status.
    rerender(panel([]));

    expect(screen.getByText(/password only/i)).toBeInTheDocument();
    expect(screen.queryByText(/two-factor authentication is on\./i)).not.toBeInTheDocument();
  });

  it("scopes a rejected removal password to the factor it was submitted for", async () => {
    const user = userEvent.setup();
    const removeFactor = vi.fn<TotpAction>(async () => ({
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "error",
      factorId: "factor-second",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { code: [], currentPassword: ["That password is not correct."] },
    }));

    render(
      <TwoFactorPanel
        factors={[
          { id: "factor-first", friendlyName: "Phone", createdAt: null },
          { id: "factor-second", friendlyName: "Backup", createdAt: null },
        ]}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={removeFactor}
      />,
    );

    await user.type(screen.getByLabelText(/current password, to remove backup/i), "wrong");
    await user.click(screen.getAllByRole("button", { name: /remove authenticator/i })[1]!);
    await waitFor(() => expect(removeFactor).toHaveBeenCalledTimes(1));

    // One shared action state, so the error has to name its factor or it would mark an
    // input the owner never submitted as invalid.
    expect(await screen.findByText(/that password is not correct/i)).toBeInTheDocument();
    expect(screen.getAllByText(/that password is not correct/i)).toHaveLength(1);
    expect(screen.getByLabelText(/current password, to remove phone/i)).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("shows a fresh enrollment after an earlier factor was confirmed and removed", async () => {
    const user = userEvent.setup();
    const enrollments = [
      {
        status: "pending-verification" as const,
        message: "Scan the code in your authenticator app, then enter the code it shows.",
        factorId: "factor-new",
        qrCode: "data:image/svg+xml;utf-8,<svg/>",
        secret: "FIRSTSECRET",
        fieldErrors: { code: [], currentPassword: [] },
      },
      {
        status: "pending-verification" as const,
        message: "Scan the code in your authenticator app, then enter the code it shows.",
        factorId: "factor-later",
        qrCode: "data:image/svg+xml;utf-8,<svg/>",
        secret: "SECONDSECRET",
        fieldErrors: { code: [], currentPassword: [] },
      },
    ];
    const startEnrollment = vi.fn<TotpAction>(
      async () => enrollments.shift() ?? INITIAL_TOTP_ENROLLMENT_STATE,
    );
    const confirmEnrollment = vi.fn<TotpAction>(async () => ({
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "success",
      factorId: "factor-new",
      message: "Two-factor authentication is on. You will be asked for a code at every sign-in.",
    }));
    const panel = (
      factors: Array<{ id: string; friendlyName: string | null; createdAt: string | null }>,
    ) => (
      <TwoFactorPanel
        factors={factors}
        currentLevel="aal1"
        factorsReadable
        startEnrollment={startEnrollment}
        confirmEnrollment={confirmEnrollment}
        removeFactor={idleTotp()}
      />
    );

    const { rerender } = render(panel([]));
    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));
    await user.type(await screen.findByLabelText(/authenticator code/i), "123456");
    await user.click(screen.getByRole("button", { name: /turn on two-factor/i }));
    await waitFor(() => expect(confirmEnrollment).toHaveBeenCalledTimes(1));
    rerender(panel([{ id: "factor-verified", friendlyName: "Phone", createdAt: null }]));
    rerender(panel([]));

    // Starting over must open a real setup view, not leave the owner pressing a button
    // that mints provider-side factors with nothing on screen.
    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));

    expect(await screen.findByText("SECONDSECRET")).toBeInTheDocument();
    expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument();
  });

  it("strips the provider uniqueness suffix from the authenticator label", () => {
    render(
      <TwoFactorPanel
        factors={[
          {
            id: "factor-verified",
            friendlyName: "Authenticator 2026-09-02 3f2a1b9c",
            createdAt: null,
          },
        ]}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={idleTotp()}
      />,
    );

    expect(screen.getByText("Authenticator 2026-09-02")).toBeInTheDocument();
    expect(screen.queryByText(/3f2a1b9c/)).not.toBeInTheDocument();
  });

  it("leaves a name chosen outside this portal exactly as it is", () => {
    render(
      <TwoFactorPanel
        factors={[{ id: "factor-verified", friendlyName: "Yubikey 12345678", createdAt: null }]}
        currentLevel="aal2"
        factorsReadable
        startEnrollment={idleTotp()}
        confirmEnrollment={idleTotp()}
        removeFactor={idleTotp()}
      />,
    );

    expect(screen.getByText("Yubikey 12345678")).toBeInTheDocument();
  });

  it("never renders a non-image QR payload as an image source", async () => {
    const user = userEvent.setup();
    const startEnrollment = vi.fn<TotpAction>(async () => ({
      status: "pending-verification",
      message: null,
      factorId: "factor-new",
      qrCode: '<svg onload="alert(1)"/>',
      secret: "SECRETVALUE",
      fieldErrors: { code: [], currentPassword: [] },
    }));

    render(
      <TwoFactorPanel
        factors={[]}
        currentLevel="aal1"
        factorsReadable
        startEnrollment={startEnrollment}
        confirmEnrollment={idleTotp()}
        removeFactor={idleTotp()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /set up an authenticator app/i }));

    expect(await screen.findByText("SECRETVALUE")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
