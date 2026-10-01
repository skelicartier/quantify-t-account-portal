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
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
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
    <>
      <PageHeader
        eyebrow="Account"
        title="Security"
        titleId="security-heading"
        description="Change your password, move to a new verified email, and require a second factor at sign-in. Every change here asks for your current password."
      />

      <div className="page-content">
        {noticeMessage && (
          <Callout role="status" tone="success">
            {noticeMessage}
          </Callout>
        )}

        <div className="settings-row">
          <div className="settings-row__intro">
            <h2 id="security-password-heading">Change password</h2>
            <p>Updating your password signs out your other sessions on this account.</p>
          </div>
          <PasswordChangeForm action={changePassword} />
        </div>

        <div className="settings-row">
          <div className="settings-row__intro">
            <h2 id="security-email-heading">Change verified email</h2>
            <p>
              Your sign-in address only changes after the confirmation links from both the current
              and the new inbox are used. Your account identity does not change.
            </p>
          </div>
          <EmailChangeForm currentEmail={account.email} action={changeEmail} />
        </div>

        <div className="settings-row">
          <div className="settings-row__intro">
            <h2 id="security-mfa-heading">Authenticator app</h2>
            <p>
              What you see here is what sign-in enforces: the status comes from your verified
              factors, not from a saved preference.
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
        </div>

        <div className="settings-row">
          <div className="settings-row__intro">
            <h2 id="security-recovery-heading">Recovery guidance</h2>
          </div>
          <Callout title="Keep these in mind">
            <ul className="stack stack--tight">
              <li>
                Keep your authenticator app backed up. This console issues no printable recovery
                codes, so a lost authenticator cannot be bypassed from this page.
              </li>
              <li>
                Losing your password alone is recoverable: use the sign-in page&apos;s password
                reset and confirm from your verified inbox.
              </li>
              <li>
                Losing your second factor requires an identity-verified support review before the
                factor can be removed. Removing it yourself always needs your current password.
              </li>
              <li>
                Password resets and email changes are confirmed by email. Treat any message you did
                not request as a warning that someone else knows your password, and change it
                immediately.
              </li>
            </ul>
          </Callout>
        </div>
      </div>
    </>
  );
}
