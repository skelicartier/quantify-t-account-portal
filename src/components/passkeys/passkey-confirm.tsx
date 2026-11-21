"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { provePasskey } from "@/lib/passkeys/ceremony";

type PasskeyConfirmProps = {
  label?: string;
  /** Where to go once confirmed. Omitted: stay here and reload what the page shows. */
  href?: string | undefined;
  variant?: "primary" | "default";
  size?: "small" | undefined;
};

/**
 * One button that asks the device for the account's passkey (fingerprint, face or the
 * device PIN) and, once the service has accepted the answer, shows what was behind it.
 */
export function PasskeyConfirm({
  label = "Confirm with passkey",
  href,
  variant = "primary",
  size,
}: PasskeyConfirmProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await provePasskey();
    if (result.status === "ok") {
      // Left busy on purpose: the page behind is on its way, and a second press would
      // only ask the device again.
      if (href) router.replace(href);
      router.refresh();
      return;
    }
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <div className="passkey-confirm">
      <Button variant={variant} size={size} busy={busy} disabled={busy} onClick={confirm}>
        {busy ? "Waiting for your device" : label}
      </Button>
      {message && (
        <Callout tone="danger" role="alert" compact>
          {message}
        </Callout>
      )}
    </div>
  );
}
