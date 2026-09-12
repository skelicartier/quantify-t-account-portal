import { describe, expect, it } from "vitest";

import { isoToLocalInput, localInputToIso } from "@/lib/format";

/**
 * A `datetime-local` input has no timezone. It shows and returns a wall clock, and the
 * browser means the viewer's own — so a stored UTC instant has to be shifted on the way in
 * and shifted back on the way out.
 *
 * The pair that used to do this got both halves wrong in a way that cancelled out on screen:
 * reading sliced the UTC string into the field, writing appended a "Z" to whatever the
 * operator typed. The operator saw back exactly what they entered, while the instant stored
 * was out by their whole UTC offset. A notice published "now" from India was recorded five
 * and a half hours ahead and sat there reading SCHEDULED, because the status check compares
 * the stored instant against the real clock rather than against the field.
 *
 * These run under a fixed non-UTC timezone (vitest.config sets TZ) precisely because the bug
 * is invisible at UTC, which is where it survived.
 */
describe("datetime-local conversion", () => {
  const offsetMinutes = new Date().getTimezoneOffset();

  it("is running somewhere that would expose an offset bug", () => {
    expect(offsetMinutes).not.toBe(0);
  });

  it("round trips an instant without moving it", () => {
    const instant = "2026-09-13T04:15:00.000Z";
    expect(localInputToIso(isoToLocalInput(instant))).toBe(instant);
  });

  it("shows the viewer's wall clock, not the UTC one", () => {
    const instant = "2026-09-13T04:15:00.000Z";
    const shown = isoToLocalInput(instant);
    const expected = new Date(Date.parse(instant) - offsetMinutes * 60_000)
      .toISOString()
      .slice(0, 16);
    expect(shown).toBe(expected);
    if (offsetMinutes !== 0) {
      expect(shown).not.toBe(instant.slice(0, 16));
    }
  });

  it("reads what the operator typed as their own time", () => {
    const typed = "2026-09-13T04:15";
    expect(localInputToIso(typed)).toBe(new Date(typed).toISOString());
  });

  it("does not schedule a notice published now into the future", () => {
    // The bug, stated as the symptom: the operator opens the form, the field shows the
    // current local time, they save, and the notice must be live rather than pending.
    const now = new Date();
    const shown = isoToLocalInput(now.toISOString());
    const stored = localInputToIso(shown);

    const drift = Math.abs(Date.parse(stored) - now.getTime());
    expect(drift).toBeLessThan(60_000);
    expect(Date.parse(stored)).toBeLessThanOrEqual(now.getTime() + 60_000);
  });

  it("treats an empty field as no date rather than the epoch", () => {
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput(undefined)).toBe("");
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso(null)).toBe("");
  });

  it("treats an unparseable value as no date", () => {
    expect(isoToLocalInput("not a date")).toBe("");
    expect(localInputToIso("not a date")).toBe("");
  });

  it("keeps the seconds field out of the input value", () => {
    // `datetime-local` without a step shows minutes; handing it seconds makes the browser
    // silently reformat and the field stops matching what was stored.
    expect(isoToLocalInput("2026-09-13T04:15:30.000Z")).toHaveLength(16);
  });
});
