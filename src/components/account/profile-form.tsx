"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { INITIAL_PROFILE_ACTION_STATE, type ProfileActionState } from "@/lib/account/profile-input";
import type { AccountProfileDto } from "@/lib/dto/profile";

type ProfileFormProps = {
  profile: AccountProfileDto;
  action: (state: ProfileActionState, formData: FormData) => Promise<ProfileActionState>;
};

export function ProfileForm({ profile, action }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_PROFILE_ACTION_STATE);
  const version = state.profileVersion ?? profile.profileVersion;
  const errors = state.fieldErrors;

  return (
    <form className="form" action={formAction} noValidate>
      <input type="hidden" name="profileVersion" value={version} />
      {errors.profileVersion[0] && (
        <Callout tone="danger" role="alert" compact>
          {errors.profileVersion[0]}
        </Callout>
      )}
      <div className="form-grid">
        <Field id="profile-first-name" label="First name" error={errors.firstName[0]}>
          <Input
            id="profile-first-name"
            name="firstName"
            defaultValue={profile.firstName}
            maxLength={80}
            autoComplete="given-name"
            required
            disabled={pending}
            invalid={Boolean(errors.firstName[0])}
            aria-describedby={describedBy("profile-first-name", { error: errors.firstName[0] })}
          />
        </Field>
        <Field id="profile-last-name" label="Last name" error={errors.lastName[0]}>
          <Input
            id="profile-last-name"
            name="lastName"
            defaultValue={profile.lastName}
            maxLength={80}
            autoComplete="family-name"
            required
            disabled={pending}
            invalid={Boolean(errors.lastName[0])}
            aria-describedby={describedBy("profile-last-name", { error: errors.lastName[0] })}
          />
        </Field>
        <Field
          id="profile-email"
          label="Verified email"
          hint="Change your sign-in address from Security; it needs a separate confirmation."
        >
          <Input id="profile-email" value={profile.email ?? "Unavailable"} readOnly disabled />
        </Field>
        <Field id="profile-phone" label="Phone" note="Optional" error={errors.phone[0]}>
          <Input
            id="profile-phone"
            name="phone"
            type="tel"
            defaultValue={profile.phone}
            maxLength={32}
            autoComplete="tel"
            disabled={pending}
            invalid={Boolean(errors.phone[0])}
            aria-describedby={describedBy("profile-phone", { error: errors.phone[0] })}
          />
        </Field>
        <Field
          id="profile-country"
          label="Country"
          className="form-grid__span"
          error={errors.country[0]}
        >
          <Input
            id="profile-country"
            name="country"
            defaultValue={profile.country}
            maxLength={80}
            autoComplete="country-name"
            required
            disabled={pending}
            invalid={Boolean(errors.country[0])}
            aria-describedby={describedBy("profile-country", { error: errors.country[0] })}
          />
        </Field>
      </div>
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
          {pending ? "Saving profile…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
