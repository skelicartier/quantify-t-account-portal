import Link from "@/components/ui/link";

import { PasskeyConfirm } from "@/components/passkeys/passkey-confirm";
import { Callout } from "@/components/ui/callout";
import { LocalTime } from "@/components/ui/local-time";
import type { PasskeyState } from "@/lib/passkeys/state";

/**
 * What Administration says about the passkey, above every one of its pages.
 *
 * Three states are worth a line. A staff account with no passkey is told its password is
 * all that stands in front of every customer's record. A confirmed session whose
 * confirmation is older than the service accepts for a change is offered the prompt
 * here, before it fills in a form the service would refuse. And a fresh one is told
 * until when, so the next prompt is not a surprise. Anything else says nothing.
 */
export function AdminPasskeyNotice({ passkey }: { passkey: PasskeyState | null | undefined }) {
  if (!passkey || !passkey.staff || passkey.mode === "off") return null;

  if (!passkey.enrolled) {
    // In `required` mode the pages themselves are shut and say why.
    if (passkey.mode === "required") return null;
    return (
      <Callout tone="attention" role="status" className="callout--banner" compact>
        This staff account has no passkey, so its password alone opens Administration.{" "}
        <Link href="/account/security#security-passkeys-heading">Add a passkey</Link> to ask
        for your fingerprint first.
      </Callout>
    );
  }

  if (!passkey.verified) return null;

  if (!passkey.fresh) {
    return (
      <Callout tone="attention" role="status" className="callout--banner passkey-notice" compact>
        <span>
          Reading is open. Changing an account, a role, a plan, a credential or a notice needs
          your passkey again.
        </span>
        <PasskeyConfirm label="Confirm with passkey" size="small" />
      </Callout>
    );
  }

  return (
    <p className="passkey-fresh" role="status">
      Passkey confirmed. Changes are open until{" "}
      <LocalTime value={passkey.freshUntil} fallback="shortly" />.
    </p>
  );
}
