import type { Metadata } from "next";

import { updatePreferences } from "@/app/account/preferences/actions";
import { PreferencesForm } from "@/components/account/preferences-form";
import { requireCurrentProfile } from "@/lib/dal/account";

export const metadata: Metadata = { title: "Preferences" };
export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const profile = await requireCurrentProfile();
  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading" aria-labelledby="preferences-heading">
        <p className="eyebrow">Shared account</p>
        <h1 id="preferences-heading">Preferences</h1>
        <p>
          Configure cloud-backed defaults and account notifications. Desktop support will follow the
          staged compatibility task.
        </p>
      </section>
      <section className="account-form-panel" aria-labelledby="preference-details-heading">
        <div>
          <p className="account-card__label">General settings</p>
          <h2 id="preference-details-heading">Account preferences</h2>
          <p>
            Changes use optimistic version checks so an older session cannot overwrite newer values.
          </p>
        </div>
        {/* Deliberately unkeyed: a remount on revalidation would reset the action
            state and discard the saved confirmation. The form tracks the committed
            version from its own action result. */}
        <PreferencesForm profile={profile} action={updatePreferences} />
      </section>
    </main>
  );
}
