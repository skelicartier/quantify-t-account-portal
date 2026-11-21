import Link from "@/components/ui/link";

import { requestPasswordRecovery } from "@/app/forgot-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";
import { turnstileSiteKey as resolveTurnstileSiteKey } from "@/lib/auth/turnstile";

export const metadata = {
  title: "Recover account",
};

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Rendered only when the challenge is fully configured — both the site key AND the secret
  // this server verifies tokens with. A widget nothing verifies is theatre, and the site key
  // alone was set in production while every page hardcoded "".
  const turnstileSiteKey = resolveTurnstileSiteKey();

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email a one-time recovery link to your verified address."
    >
      <RecoveryRequestForm action={requestPasswordRecovery} turnstileSiteKey={turnstileSiteKey} />

      <p className="auth__switch">
        Remember your password? <Link href="/login">Return to sign in</Link>
      </p>
    </AuthShell>
  );
}
