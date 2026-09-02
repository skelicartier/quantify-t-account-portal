import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreferencesForm } from "@/components/account/preferences-form";
import { ProfileForm } from "@/components/account/profile-form";
import {
  INITIAL_PREFERENCES_ACTION_STATE,
  INITIAL_PROFILE_ACTION_STATE,
} from "@/lib/account/profile-input";
import type { AccountProfileDto } from "@/lib/dto/profile";

const profile: AccountProfileDto = {
  userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
  email: "user@example.com",
  firstName: "Avery",
  lastName: "Stone",
  phone: "+1 415 555 0100",
  country: "United States",
  timezone: "America/New_York",
  defaultCurrency: "USD",
  notifyPriceAlerts: true,
  notifyPortfolioMoves: false,
  notifyNewsDigest: true,
  profileVersion: 4,
  updatedAt: "2026-09-02T08:00:00.000Z",
};

describe("account profile forms", () => {
  it("renders labeled profile fields with verified email read-only", () => {
    const { container } = render(
      <ProfileForm profile={profile} action={vi.fn(async () => INITIAL_PROFILE_ACTION_STATE)} />,
    );

    expect(screen.getByLabelText("First name")).toHaveValue("Avery");
    expect(screen.getByLabelText("Last name")).toHaveValue("Stone");
    expect(screen.getByLabelText("Phone")).toHaveValue("+1 415 555 0100");
    expect(screen.getByLabelText("Country")).toHaveValue("United States");
    expect(screen.getByLabelText("Verified email")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    expect(container.querySelector('input[name="profileVersion"]')).toHaveValue("4");
  });

  it("offers no image, file, or photo control on the profile surface", () => {
    const { container } = render(
      <ProfileForm profile={profile} action={vi.fn(async () => INITIAL_PROFILE_ACTION_STATE)} />,
    );

    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container).not.toHaveTextContent(/photo|image|avatar/i);
    expect(container).not.toHaveTextContent(/passcode|pin/i);
  });

  it("renders cloud-backed preferences with explicit notification labels", () => {
    const { container } = render(
      <PreferencesForm
        profile={profile}
        action={vi.fn(async () => INITIAL_PREFERENCES_ACTION_STATE)}
      />,
    );

    expect(screen.getByLabelText("Timezone")).toHaveValue("America/New_York");
    expect(screen.getByLabelText("Default currency")).toHaveValue("USD");
    expect(screen.getByRole("checkbox", { name: /price alerts/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /portfolio moves/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /news digest/i })).toBeChecked();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });
  it("renders the profile version rejection so a tampered token is not silent", async () => {
    render(
      <ProfileForm
        profile={profile}
        action={vi.fn(async () => ({
          ...INITIAL_PROFILE_ACTION_STATE,
          status: "error" as const,
          message: "Review the highlighted profile fields.",
          fieldErrors: {
            ...INITIAL_PROFILE_ACTION_STATE.fieldErrors,
            profileVersion: ["This page is out of date. Reload the page and try again."],
          },
        }))}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(
        screen.getByText("This page is out of date. Reload the page and try again."),
      ).toBeInTheDocument(),
    );
  });

  it("renders a notification rejection next to the notification group", async () => {
    render(
      <PreferencesForm
        profile={profile}
        action={vi.fn(async () => ({
          ...INITIAL_PREFERENCES_ACTION_STATE,
          status: "error" as const,
          message: "Review the highlighted preference fields.",
          fieldErrors: {
            ...INITIAL_PREFERENCES_ACTION_STATE.fieldErrors,
            notifications: ["Notification choices must be on or off."],
          },
        }))}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    await waitFor(() =>
      expect(screen.getByText("Notification choices must be on or off.")).toBeInTheDocument(),
    );
  });

  it("keeps a committed stale version in the hidden token so a retry can succeed", () => {
    const { container } = render(
      <ProfileForm profile={profile} action={vi.fn(async () => INITIAL_PROFILE_ACTION_STATE)} />,
    );

    // The server-rendered version seeds the token; the action result overrides it.
    expect(container.querySelector('input[name="profileVersion"]')).toHaveValue("4");
  });

  it("keeps the saved confirmation when the committed version changes", async () => {
    const action = vi.fn(async () => ({
      ...INITIAL_PROFILE_ACTION_STATE,
      status: "success" as const,
      message: "Profile saved.",
      profileVersion: 5,
    }));
    const { rerender } = render(<ProfileForm profile={profile} action={action} />);

    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(screen.getByText("Profile saved.")).toBeInTheDocument());

    // Revalidation delivers the incremented version; the banner must survive it.
    rerender(<ProfileForm profile={{ ...profile, profileVersion: 5 }} action={action} />);

    expect(screen.getByText("Profile saved.")).toBeInTheDocument();
  });

  it("renders both account forms unkeyed so revalidation cannot reset action state", async () => {
    const { readFile } = await import("node:fs/promises");
    const profilePage = await readFile("src/app/account/profile/page.tsx", "utf8");
    const preferencesPage = await readFile("src/app/account/preferences/page.tsx", "utf8");

    expect(profilePage).not.toMatch(/<ProfileForm[^>]*\skey=/u);
    expect(preferencesPage).not.toMatch(/<PreferencesForm[^>]*\skey=/u);
  });
});
