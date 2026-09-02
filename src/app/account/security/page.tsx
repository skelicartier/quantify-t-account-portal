import type { Metadata } from "next";

import {
  changeEmail,
  changePassword,
  confirmTotpEnrollment,
  removeTotpFactor,
  startTotpEnrollment,
} from "@/app/account/security/actions";
import { EmailChangeForm } from "@/components/account/email-change-form";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { TwoFactorPanel } from "@/components/account/two-factor-panel";
import { requireCurrentAccount } from "@/lib/dal/account";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  "email-change-confirmed":
    "Email change confirmed. If you have not confirmed from both inboxes yet, the previous address still applies.",
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireCurrentAccount();
  const assurance = await getCurrentAssurance();
  const { notice } = await searchParams;
  const noticeMessage = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading" aria-labelledby="security-heading">
        <p className="eyebrow">Shared account</p>
        <h1 id="security-heading">Security</h1>
        <p>
          Change your password, move to a new verified email address, and require a second factor at
          sign-in. Every change here asks for your current password.
        </p>
        {noticeMessage && (
          <p className="auth-alert" role="status">
            {noticeMessage}
          </p>
        )}
      </section>

      <section className="account-form-panel" aria-labelledby="security-password-heading">
        <div>
          <p className="account-card__label">Password</p>
          <h2 id="security-password-heading">Change password</h2>
          <p>Updating your password signs out your other sessions on this account.</p>
        </div>
        <PasswordChangeForm action={changePassword} />
      </section>

      <section className="account-form-panel" aria-labelledby="security-email-heading">
        <div>
          <p className="account-card__label">Email</p>
          <h2 id="security-email-heading">Change verified email</h2>
          <p>
            Your sign-in address only changes after the confirmation links from both the current and
            the new inbox are used. Your account identity does not change.
          </p>
        </div>
        <EmailChangeForm currentEmail={account.email} action={changeEmail} />
      </section>

      <section className="account-form-panel" aria-labelledby="security-mfa-heading">
        <div>
          <p className="account-card__label">Two-factor authentication</p>
          <h2 id="security-mfa-heading">Authenticator app</h2>
          <p>
            Two-factor state comes from your verified authentication factors, not from a stored
            preference, so what you see here is what sign-in enforces.
          </p>
        </div>
        <TwoFactorPanel
          factors={assurance.verifiedTotpFactors}
          currentLevel={assurance.currentLevel}
          factorsReadable={assurance.factorsReadable}
          startEnrollment={startTotpEnrollment}
          confirmEnrollment={confirmTotpEnrollment}
          removeFactor={removeTotpFactor}
        />
      </section>

      <section className="account-form-panel" aria-labelledby="security-recovery-heading">
        <div>
          <p className="account-card__label">If you lose access</p>
          <h2 id="security-recovery-heading">Recovery guidance</h2>
        </div>
        <ul className="account-guidance-list">
          <li>
            Keep your authenticator app backed up. This portal issues no printable recovery codes,
            so a lost authenticator cannot be bypassed from this page.
          </li>
          <li>
            Losing your password alone is recoverable: use the sign-in page&apos;s password reset
            and confirm from your verified inbox.
          </li>
          <li>
            Losing your second factor requires an identity-verified support review before the factor
            can be removed. Removing it yourself always needs your current password.
          </li>
          <li>
            Password resets and email changes are confirmed by email. Treat any message you did not
            request as a warning that someone else knows your password, and change it immediately.
          </li>
        </ul>
      </section>
    </main>
  );
}
