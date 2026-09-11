import type { Metadata } from "next";

import { updateProfile } from "@/app/account/profile/actions";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader } from "@/components/shell/page-header";
import { requireCurrentProfile } from "@/lib/dal/account";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireCurrentProfile();
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        titleId="profile-heading"
        description="The details shared with your terminal. Your sign-in address is managed under Security."
      />
      <div className="page-content">
        <div className="settings-row">
          <div className="settings-row__intro">
            <p className="eyebrow">Contact details</p>
            <h2 id="profile-details-heading">Who you are</h2>
            <p>Saved to your account and visible in the desktop terminal after its next sync.</p>
          </div>
          {/* Deliberately unkeyed: a remount on revalidation would reset the action
              state and discard the saved confirmation. The form tracks the committed
              version from its own action result. */}
          <ProfileForm profile={profile} action={updateProfile} />
        </div>
      </div>
    </>
  );
}
