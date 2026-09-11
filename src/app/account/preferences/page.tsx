import type { Metadata } from "next";

import { updatePreferences } from "@/app/account/preferences/actions";
import { PreferencesForm } from "@/components/account/preferences-form";
import { PageHeader } from "@/components/shell/page-header";
import { requireCurrentProfile } from "@/lib/dal/account";

export const metadata: Metadata = { title: "Preferences" };
export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const profile = await requireCurrentProfile();
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Preferences"
        titleId="preferences-heading"
        description="Defaults for your terminal and the notices you want to receive."
      />
      <div className="page-content">
        <div className="settings-row">
          <div className="settings-row__intro">
            <p className="eyebrow">Defaults</p>
            <h2 id="preference-details-heading">Locale and notifications</h2>
            <p>
              Saves are checked against the version you loaded, so an older tab can never overwrite
              a newer change.
            </p>
          </div>
          {/* Deliberately unkeyed: a remount on revalidation would reset the action
              state and discard the saved confirmation. The form tracks the committed
              version from its own action result. */}
          <PreferencesForm profile={profile} action={updatePreferences} />
        </div>
      </div>
    </>
  );
}
