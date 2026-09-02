import type { Metadata } from "next";

import { updateProfile } from "@/app/account/profile/actions";
import { ProfileForm } from "@/components/account/profile-form";
import { requireCurrentProfile } from "@/lib/dal/account";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireCurrentProfile();
  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading" aria-labelledby="profile-heading">
        <p className="eyebrow">Shared account</p>
        <h1 id="profile-heading">Profile</h1>
        <p>
          Manage the identity details shared with Quantify Terminal. Your verified email uses a
          separate security flow.
        </p>
      </section>
      <section className="account-form-panel" aria-labelledby="profile-details-heading">
        <div>
          <p className="account-card__label">Contact details</p>
          <h2 id="profile-details-heading">Shared profile</h2>
          <p>These values are stored under your immutable cloud account UUID.</p>
        </div>
        {/* Deliberately unkeyed: a remount on revalidation would reset the action
            state and discard the saved confirmation. The form tracks the committed
            version from its own action result. */}
        <ProfileForm profile={profile} action={updateProfile} />
      </section>
    </main>
  );
}
