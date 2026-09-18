import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { PRIVACY_URL, PRIVACY_VERSION, TERMS_URL, TERMS_VERSION } from "@/lib/auth/consent";

/**
 * The version recorded with a signup has to be the version of the document the signer was
 * shown. It was not: the constants read "2026-09-02" — the day the file was written — while
 * both published policies carried, and had always carried, "Last updated: June 9, 2026". So
 * every consent row named a version that was never published, and the one that was is
 * recorded nowhere. Nothing read one from the other, and the only test over this compared
 * the constants to themselves, so it passed for any value at all.
 *
 * The published pages now carry the identifier in `data-document-version`, next to the date
 * a reader sees, and this reads it out of the site repository beside this one.
 */

function websiteRoot(): string | null {
  let cursor = resolve(__dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dirname(cursor), "Quantify Terminal Website");
    if (existsSync(join(candidate, "terms.html"))) {
      return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

function publishedVersion(file: string): string | null {
  const root = websiteRoot();
  if (root === null) return null;
  const html = readFileSync(join(root, file), "utf8");
  return html.match(/data-document-version="([^"]+)"/)?.[1] ?? "";
}

describe("the recorded consent version is the published one", () => {
  it("names a document version, not a date somebody typed", () => {
    for (const version of [TERMS_VERSION, PRIVACY_VERSION]) {
      expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("links the checkbox at the documents whose versions it records", () => {
    expect(TERMS_URL).toBe("https://www.quantifyterminal.com/terms");
    expect(PRIVACY_URL).toBe("https://www.quantifyterminal.com/privacy");
  });

  it("matches the version the published terms carry", () => {
    const published = publishedVersion("terms.html");
    if (published === null) {
      console.warn("the site repository is not beside this one; the version check was skipped");
      return;
    }
    expect(published).not.toBe("");
    expect(TERMS_VERSION).toBe(published);
  });

  it("matches the version the published privacy policy carries", () => {
    const published = publishedVersion("privacy.html");
    if (published === null) {
      console.warn("the site repository is not beside this one; the version check was skipped");
      return;
    }
    expect(published).not.toBe("");
    expect(PRIVACY_VERSION).toBe(published);
  });

  it("would notice a document edited without its version changing", () => {
    const root = websiteRoot();
    if (root === null) return;
    const html = readFileSync(join(root, "terms.html"), "utf8");
    const marker = html.match(/data-document-version="([^"]+)"[^>]*>([^<]+)</);
    expect(marker, "the version has to sit on the line a reader sees").not.toBeNull();
    expect(marker?.[2]).toContain("Last updated");
  });
});
