import Link from "next/link";

import { requestPasswordRecovery } from "@/app/forgot-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

export const metadata = {
  title: "Recover account",
};

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const { turnstileSiteKey } = getSupabasePublicConfiguration();

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Request a one-time recovery link for your verified Quantify account."
    >
      <RecoveryRequestForm action={requestPasswordRecovery} turnstileSiteKey={turnstileSiteKey} />

      <p className="auth-card__footer">
        Remember your password? <Link href="/login">Return to sign in</Link>
      </p>
    </AuthShell>
  );
}
