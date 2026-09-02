import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DESKTOP_SUPABASE_MIGRATION_FILENAMES,
  type MigrationArtifact,
} from "@/lib/preflight/model";

export type DesktopSupabaseEvidence = {
  /** Concatenated authoritative schema plus pinned migrations, or null when incomplete. */
  schema: string | null;
  /** Every observed migration file, or null when the directory could not be read. */
  migrations: readonly MigrationArtifact[] | null;
};

async function readKnownBytes(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function listKnownDirectory(path: string): Promise<string[] | null> {
  try {
    return await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Collect desktop Supabase source-integrity evidence.
 *
 * The observed list comes from the migrations directory, not from the pinned
 * manifest, so an unpinned extra migration is reported instead of being invisible.
 * Digests are computed over raw bytes before any decoding, so whitespace,
 * encoding, and comment drift cannot be normalized away. Unreadable evidence is
 * reported as null rather than as a shorter passing list.
 */
export async function collectDesktopSupabaseEvidence(
  desktopRoot: string,
): Promise<DesktopSupabaseEvidence> {
  const migrationDirectory = resolve(desktopRoot, "supabase/migrations");
  const entries = await listKnownDirectory(migrationDirectory);
  if (entries === null) return { schema: null, migrations: null };

  const observedNames = entries.filter((name) => name.endsWith(".sql")).sort();
  const observed: MigrationArtifact[] = [];
  const decoded = new Map<string, string>();
  for (const filename of observedNames) {
    const bytes = await readKnownBytes(resolve(migrationDirectory, filename));
    if (bytes === null) return { schema: null, migrations: null };
    decoded.set(filename, bytes.toString("utf8"));
    observed.push({ filename, sha256: createHash("sha256").update(bytes).digest("hex") });
  }

  const schemaBytes = await readKnownBytes(
    resolve(desktopRoot, "src/database/supabase_schema.sql"),
  );
  const pinnedSources = DESKTOP_SUPABASE_MIGRATION_FILENAMES.map((filename) =>
    decoded.get(filename),
  );
  const schemaAvailable =
    schemaBytes !== null && pinnedSources.every((source) => source !== undefined);

  return {
    schema: schemaAvailable
      ? [schemaBytes.toString("utf8"), ...(pinnedSources as string[])].join("\n\n")
      : null,
    migrations: observed,
  };
}
