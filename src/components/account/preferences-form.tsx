"use client";

import { useActionState } from "react";

import {
  INITIAL_PREFERENCES_ACTION_STATE,
  type PreferencesActionState,
} from "@/lib/account/profile-input";
import type { AccountProfileDto } from "@/lib/dto/profile";

type PreferencesFormProps = {
  profile: AccountProfileDto;
  action: (state: PreferencesActionState, formData: FormData) => Promise<PreferencesActionState>;
};

export function PreferencesForm({ profile, action }: PreferencesFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_PREFERENCES_ACTION_STATE);
  const version = state.profileVersion ?? profile.profileVersion;
  return (
    <form className="account-form" action={formAction} noValidate>
      <input type="hidden" name="profileVersion" value={version} />
      <div className="account-form__grid">
        <div className="field-group">
          <label htmlFor="profile-timezone">Timezone</label>
          <input
            id="profile-timezone"
            name="timezone"
            defaultValue={profile.timezone}
            maxLength={80}
            autoComplete="off"
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.timezone[0])}
            aria-describedby={
              state.fieldErrors.timezone[0] ? "profile-timezone-error" : "profile-timezone-help"
            }
          />
          <p className="field-help" id="profile-timezone-help">
            Use an IANA timezone such as America/New_York, Europe/London, or UTC.
          </p>
          {state.fieldErrors.timezone[0] && (
            <p className="field-error" id="profile-timezone-error">
              {state.fieldErrors.timezone[0]}
            </p>
          )}
        </div>
        <div className="field-group">
          <label htmlFor="profile-currency">Default currency</label>
          <input
            id="profile-currency"
            name="defaultCurrency"
            defaultValue={profile.defaultCurrency}
            minLength={3}
            maxLength={3}
            autoCapitalize="characters"
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.defaultCurrency[0])}
            aria-describedby={
              state.fieldErrors.defaultCurrency[0] ? "profile-currency-error" : undefined
            }
          />
          {state.fieldErrors.defaultCurrency[0] && (
            <p className="field-error" id="profile-currency-error">
              {state.fieldErrors.defaultCurrency[0]}
            </p>
          )}
        </div>
      </div>
      <fieldset className="account-preference-list" disabled={pending}>
        <legend>Notification preferences</legend>
        <label>
          <input
            name="notifyPriceAlerts"
            type="checkbox"
            defaultChecked={profile.notifyPriceAlerts}
          />
          <span>
            <strong>Price alerts</strong> Receive account notifications for configured price
            conditions.
          </span>
        </label>
        <label>
          <input
            name="notifyPortfolioMoves"
            type="checkbox"
            defaultChecked={profile.notifyPortfolioMoves}
          />
          <span>
            <strong>Portfolio moves</strong> Receive account notifications for significant portfolio
            movement.
          </span>
        </label>
        <label>
          <input
            name="notifyNewsDigest"
            type="checkbox"
            defaultChecked={profile.notifyNewsDigest}
          />
          <span>
            <strong>News digest</strong> Receive the optional account news digest.
          </span>
        </label>
        {state.fieldErrors.notifications[0] && (
          <p className="field-error" id="profile-notifications-error" role="alert">
            {state.fieldErrors.notifications[0]}
          </p>
        )}
      </fieldset>
      {state.fieldErrors.profileVersion[0] && (
        <p className="field-error" id="preferences-version-error" role="alert">
          {state.fieldErrors.profileVersion[0]}
        </p>
      )}
      {state.message && (
        <p
          className={`account-form__status account-form__status--${state.status}`}
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? "Saving preferences…" : "Save preferences"}
      </button>
    </form>
  );
}
