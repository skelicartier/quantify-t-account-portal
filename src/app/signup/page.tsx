import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = {
  title: "Create account",
};

export default function SignupFoundationPage() {
  return (
    <AuthShell
      eyebrow="Website-only registration"
      title="Create your account"
      description="Registration and email verification will be completed here—not inside the desktop application."
    >
      <div className="foundation-panel">
        <p>
          The secure signup workflow is staged after the shared identity contract is verified. No
          desktop PIN will ever be requested on this website.
        </p>
        <Link className="button" href="/login">
          Return to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
