import Link from "next/link";

import { signup } from "@/app/signup/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

export const metadata = {
  title: "Create account",
};

export const dynamic = "force-dynamic";

export default function SignupPage() {
  const { turnstileSiteKey } = getSupabasePublicConfiguration();

  return (
    <AuthShell
      eyebrow="Website-only registration"
      title="Create your account"
      description="Create one verified Quantify account for this portal and your desktop terminal."
    >
      <SignupForm action={signup} turnstileSiteKey={turnstileSiteKey} />

      <p className="auth-card__footer">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
