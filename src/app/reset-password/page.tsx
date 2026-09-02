import Link from "next/link";

import { resetPassword } from "@/app/reset-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = {
  title: "Choose a new password",
};

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Verified recovery"
      title="Choose a new password"
      description="Your recovery link must still be valid before the password can be changed."
    >
      <ResetPasswordForm action={resetPassword} />

      <p className="auth-card__footer">
        Link expired? <Link href="/forgot-password">Request another recovery email</Link>
      </p>
    </AuthShell>
  );
}
