"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import {
  INITIAL_PROFILE_ACTION_STATE,
  PROFILE_EXPERIENCE,
  PROFILE_INTERESTS,
  PROFILE_MARKETS,
  PROFILE_WORKFLOWS,
  type ProfileActionState,
} from "@/lib/account/profile-input";
import type { AccountProfileDto } from "@/lib/dto/profile";

type ProfileFormProps = {
  profile: AccountProfileDto;
  action: (state: ProfileActionState, formData: FormData) => Promise<ProfileActionState>;
};

/**
 * One group of fields, introduced by the column beside it.
 *
 * The page used to put a single intro beside the WHOLE form, which left a heading three
 * lines long sitting next to a form fifteen fields tall — around a thousand pixels of empty
 * column. Introducing each group separately means every row is only as tall as its own
 * content, and the reader gets a heading where they actually need one.
 */
function Group({
  eyebrow,
  title,
  description,
  headingId,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  headingId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-row" aria-labelledby={headingId}>
      <div className="settings-row__intro">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="form-group">{children}</div>
    </section>
  );
}

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
      <Group
        eyebrow="Contact details"
        title="Who you are"
        description="Saved to your account and visible in the desktop terminal after its next sync."
        headingId="profile-details-heading"
      >
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
      </Group>

      <Group
        eyebrow="About you"
        title="What you do"
        description="All optional. None of it changes what you can do — it changes what the terminal assumes when it has to guess."
        headingId="profile-about-heading"
      >
        <div className="form-grid">
          <Field
            id="profile-display-name"
            label="Display name"
            note="Optional"
            error={errors.displayName[0]}
          >
            <Input
              id="profile-display-name"
              name="displayName"
              defaultValue={profile.displayName}
              maxLength={80}
              disabled={pending}
              invalid={Boolean(errors.displayName[0])}
              aria-describedby={describedBy("profile-display-name", {
                error: errors.displayName[0],
              })}
            />
          </Field>
          <Field
            id="profile-occupation"
            label="Occupation"
            note="Optional"
            error={errors.occupation[0]}
          >
            <Input
              id="profile-occupation"
              name="occupation"
              defaultValue={profile.occupation}
              maxLength={120}
              placeholder="Portfolio manager, analyst, trader, student…"
              disabled={pending}
              invalid={Boolean(errors.occupation[0])}
              aria-describedby={describedBy("profile-occupation", { error: errors.occupation[0] })}
            />
          </Field>
          <Field id="profile-company" label="Company" note="Optional" error={errors.company[0]}>
            <Input
              id="profile-company"
              name="company"
              defaultValue={profile.company}
              maxLength={120}
              disabled={pending}
              invalid={Boolean(errors.company[0])}
              aria-describedby={describedBy("profile-company", { error: errors.company[0] })}
            />
          </Field>
          <Field id="profile-website" label="Website" note="Optional" error={errors.website[0]}>
            <Input
              id="profile-website"
              name="website"
              type="url"
              defaultValue={profile.website}
              maxLength={200}
              placeholder="https://"
              disabled={pending}
              invalid={Boolean(errors.website[0])}
              aria-describedby={describedBy("profile-website", { error: errors.website[0] })}
            />
          </Field>
          <Field
            id="profile-experience"
            label="Experience"
            hint="Only used to pick sensible defaults. Nothing is hidden from anyone."
            className="form-grid__span"
          >
            <Select
              id="profile-experience"
              name="experienceLevel"
              defaultValue={profile.experienceLevel}
              disabled={pending}
            >
              {PROFILE_EXPERIENCE.map((option) => (
                <option key={option.value || "unset"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="profile-bio"
            label="About"
            note="Optional"
            className="form-grid__span"
            error={errors.bio[0]}
          >
            <Textarea
              id="profile-bio"
              name="bio"
              rows={3}
              defaultValue={profile.bio}
              maxLength={500}
              placeholder="A short note about what you work on."
              disabled={pending}
              invalid={Boolean(errors.bio[0])}
              aria-describedby={describedBy("profile-bio", { error: errors.bio[0] })}
            />
          </Field>
        </div>
      </Group>

      <Group
        eyebrow="What you follow"
        title="Markets you care about"
        description="These shape the desktop's tab order, its Pulse universe and what a fresh watchlist starts with. You answered them once during setup — this is where you change your mind."
        headingId="profile-focus-heading"
      >
        {errors.focus[0] && (
          <Callout tone="danger" role="alert" compact>
            {errors.focus[0]}
          </Callout>
        )}
        <p className="field__label field__label--group">Asset classes</p>
        <div className="choice-list">
          {PROFILE_INTERESTS.map((option) => (
            <Checkbox
              key={option.value}
              id={`profile-interest-${option.value}`}
              name="interests"
              value={option.value}
              label={option.label}
              defaultChecked={profile.interests.includes(option.value)}
              disabled={pending}
            />
          ))}
        </div>
        <p className="field__label field__label--group">Markets</p>
        <div className="choice-list">
          {PROFILE_MARKETS.map((option) => (
            <Checkbox
              key={option.value}
              id={`profile-market-${option.value}`}
              name="markets"
              value={option.value}
              label={option.label}
              defaultChecked={profile.markets.includes(option.value)}
              disabled={pending}
            />
          ))}
        </div>
        <Field
          id="profile-workflow"
          label="Mostly here to"
          hint="Decides which tab the desktop opens on."
        >
          <Select
            id="profile-workflow"
            name="primaryWorkflow"
            defaultValue={profile.primaryWorkflow}
            disabled={pending}
          >
            {PROFILE_WORKFLOWS.map((option) => (
              <option key={option.value || "unset"} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </Group>

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
