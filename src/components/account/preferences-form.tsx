"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, describedBy } from "@/components/ui/field";
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
  const errors = state.fieldErrors;
  const timezoneHint = "Use an IANA timezone such as America/New_York, Europe/London, or UTC.";

  return (
    <form className="form" action={formAction} noValidate>
      <input type="hidden" name="profileVersion" value={version} />
      <div className="form-grid">
        <Field
          id="profile-timezone"
          label="Timezone"
          hint={timezoneHint}
          error={errors.timezone[0]}
        >
          <Input
            id="profile-timezone"
            name="timezone"
            defaultValue={profile.timezone}
            maxLength={80}
            autoComplete="off"
            required
            disabled={pending}
            invalid={Boolean(errors.timezone[0])}
            aria-describedby={describedBy("profile-timezone", {
              hint: timezoneHint,
              error: errors.timezone[0],
            })}
          />
        </Field>
        <Field
          id="profile-currency"
          label="Default currency"
          note="3-letter code"
          error={errors.defaultCurrency[0]}
        >
          <Input
            id="profile-currency"
            name="defaultCurrency"
            defaultValue={profile.defaultCurrency}
            minLength={3}
            maxLength={3}
            autoCapitalize="characters"
            required
            disabled={pending}
            invalid={Boolean(errors.defaultCurrency[0])}
            aria-describedby={describedBy("profile-currency", { error: errors.defaultCurrency[0] })}
          />
        </Field>
      </div>

      <fieldset className="fieldset" disabled={pending}>
        <legend className="fieldset__legend">Notifications</legend>
        <div className="choice-list">
          <Checkbox
            id="pref-price-alerts"
            name="notifyPriceAlerts"
            label="Price alerts"
            description="Get a notice when a price condition you configured is met."
            defaultChecked={profile.notifyPriceAlerts}
          />
          <Checkbox
            id="pref-portfolio-moves"
            name="notifyPortfolioMoves"
            label="Portfolio moves"
            description="Get a notice on significant movement in your portfolio."
            defaultChecked={profile.notifyPortfolioMoves}
          />
          <Checkbox
            id="pref-news-digest"
            name="notifyNewsDigest"
            label="News digest"
            description="Receive the optional account news digest."
            defaultChecked={profile.notifyNewsDigest}
          />
        </div>
        {errors.notifications[0] && (
          <p className="field__error" id="profile-notifications-error" role="alert">
            {errors.notifications[0]}
          </p>
        )}
      </fieldset>

      {errors.profileVersion[0] && (
        <Callout tone="danger" role="alert" compact>
          {errors.profileVersion[0]}
        </Callout>
      )}
      {state.message && (
        <Callout
          tone={state.status === "success" ? "success" : "danger"}
          role={state.status === "success" ? "status" : "alert"}
          compact
        >
          {state.message}
        </Callout>
      )}
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Saving preferences…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
