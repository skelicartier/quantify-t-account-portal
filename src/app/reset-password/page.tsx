import Link from "@/components/ui/link";

import { resetPassword } from "@/app/reset-password/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = {
  title: "Choose a new password",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Choose a new password"
      description="Your recovery link must still be valid to change the password."
    >
      <ResetPasswordForm action={resetPassword} token={token} />

      <p className="auth__switch">
        Link expired? <Link href="/forgot-password">Request another recovery email</Link>
      </p>
    </AuthShell>
  );
}
