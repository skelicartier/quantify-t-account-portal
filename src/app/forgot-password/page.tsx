import Link from "next/link";

import { requestPasswordRecovery } from "@/app/forgot-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";

export const metadata = {
  title: "Recover account",
};

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const turnstileSiteKey = "";

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="We'll email a one-time recovery link to your verified address."
    >
      <RecoveryRequestForm action={requestPasswordRecovery} turnstileSiteKey={turnstileSiteKey} />

      <p className="auth-card__footer">
        Remember your password? <Link href="/login">Return to sign in</Link>
      </p>
    </AuthShell>
  );
}
