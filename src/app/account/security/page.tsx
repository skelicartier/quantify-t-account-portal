import type { Metadata } from "next";

import { changeEmail, changePassword } from "@/app/account/security/actions";
import { EmailChangeForm } from "@/components/account/email-change-form";
import { PasskeyPanel } from "@/components/account/passkey-panel";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { requireCurrentAccount } from "@/lib/dal/account";
import { getCurrentPasskeys } from "@/lib/dal/assurance-guard";
import { requestNow } from "@/lib/request-time";

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
  const passkeys = await getCurrentPasskeys();
  const now = requestNow();
  const { notice } = await searchParams;
  const noticeMessage = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Security"
        titleId="security-heading"
        description="Change your password, move to a new verified email, and protect this account with a passkey. Every change here asks for your current password."
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
            <h2 id="security-passkeys-heading">Passkeys</h2>
            <p>
              A passkey lives on your own device and is unlocked by your fingerprint, face or
              device PIN. It cannot be typed into a look-alike site, and nothing this service
              stores can sign in with it. Once you have one, the console asks for it in every
              new session.
            </p>
          </div>
          <PasskeyPanel
            passkeys={passkeys?.passkeys ?? []}
            state={passkeys?.state ?? null}
            maxPasskeys={passkeys?.maxPasskeys ?? 10}
            now={now}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row__intro">
            <h2 id="security-recovery-heading">Recovery guidance</h2>
          </div>
          <Callout title="Keep these in mind">
            <ul className="stack stack--tight">
              <li>
                Add a second passkey on another device (a phone, a security key) so that losing
                one does not lock you out. Passkeys kept in iCloud Keychain or Google Password
                Manager also follow you to your other devices.
              </li>
              <li>
                Losing your password alone is recoverable: use the sign-in page&apos;s password
                reset and confirm from your verified inbox. A reset does not remove a passkey.
              </li>
              <li>
                Losing every device that holds a passkey needs the workspace Owner to reset your
                passkeys after checking it is you. Nothing in this console, and no link in any
                email, can remove one.
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
