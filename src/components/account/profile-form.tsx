"use client";

import { useActionState } from "react";

import { INITIAL_PROFILE_ACTION_STATE, type ProfileActionState } from "@/lib/account/profile-input";
import type { AccountProfileDto } from "@/lib/dto/profile";

type ProfileFormProps = {
  profile: AccountProfileDto;
  action: (state: ProfileActionState, formData: FormData) => Promise<ProfileActionState>;
};

export function ProfileForm({ profile, action }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_PROFILE_ACTION_STATE);
  const version = state.profileVersion ?? profile.profileVersion;
  return (
    <form className="account-form" action={formAction} noValidate>
      <input type="hidden" name="profileVersion" value={version} />
      {state.fieldErrors.profileVersion[0] && (
        <p className="field-error" id="profile-version-error" role="alert">
          {state.fieldErrors.profileVersion[0]}
        </p>
      )}
      <div className="account-form__grid">
        <div className="field-group">
          <label htmlFor="profile-first-name">First name</label>
          <input
            id="profile-first-name"
            name="firstName"
            defaultValue={profile.firstName}
            maxLength={80}
            autoComplete="given-name"
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.firstName[0])}
            aria-describedby={
              state.fieldErrors.firstName[0] ? "profile-first-name-error" : undefined
            }
          />
          {state.fieldErrors.firstName[0] && (
            <p className="field-error" id="profile-first-name-error">
              {state.fieldErrors.firstName[0]}
            </p>
          )}
        </div>
        <div className="field-group">
          <label htmlFor="profile-last-name">Last name</label>
          <input
            id="profile-last-name"
            name="lastName"
            defaultValue={profile.lastName}
            maxLength={80}
            autoComplete="family-name"
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.lastName[0])}
            aria-describedby={state.fieldErrors.lastName[0] ? "profile-last-name-error" : undefined}
          />
          {state.fieldErrors.lastName[0] && (
            <p className="field-error" id="profile-last-name-error">
              {state.fieldErrors.lastName[0]}
            </p>
          )}
        </div>
        <div className="field-group">
          <label htmlFor="profile-email">Verified email</label>
          <input id="profile-email" value={profile.email ?? "Unavailable"} readOnly disabled />
          <p className="field-help">Email changes require a separately verified security flow.</p>
        </div>
        <div className="field-group">
          <label htmlFor="profile-phone">Phone</label>
          <input
            id="profile-phone"
            name="phone"
            type="tel"
            defaultValue={profile.phone}
            maxLength={32}
            autoComplete="tel"
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.phone[0])}
            aria-describedby={state.fieldErrors.phone[0] ? "profile-phone-error" : undefined}
          />
          {state.fieldErrors.phone[0] && (
            <p className="field-error" id="profile-phone-error">
              {state.fieldErrors.phone[0]}
            </p>
          )}
        </div>
        <div className="field-group account-form__span">
          <label htmlFor="profile-country">Country</label>
          <input
            id="profile-country"
            name="country"
            defaultValue={profile.country}
            maxLength={80}
            autoComplete="country-name"
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.country[0])}
            aria-describedby={state.fieldErrors.country[0] ? "profile-country-error" : undefined}
          />
          {state.fieldErrors.country[0] && (
            <p className="field-error" id="profile-country-error">
              {state.fieldErrors.country[0]}
            </p>
          )}
        </div>
      </div>
      {state.message && (
        <p
          className={`account-form__status account-form__status--${state.status}`}
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? "Saving profile…" : "Save profile"}
      </button>
    </form>
  );
}
