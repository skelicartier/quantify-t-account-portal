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
        {/* Deliberately unkeyed: a remount on revalidation would reset the action state and
            discard the saved confirmation. The form tracks the committed version from its
            own action result. The form introduces each of its own groups, so there is no
            wrapper row here to leave an empty column beside it. */}
        <ProfileForm profile={profile} action={updateProfile} />
      </div>
    </>
  );
}
