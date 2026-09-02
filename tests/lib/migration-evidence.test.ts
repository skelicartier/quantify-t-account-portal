import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { collectDesktopSupabaseEvidence } from "@/lib/preflight/migration-evidence";
import { DESKTOP_SUPABASE_MIGRATION_FILENAMES } from "@/lib/preflight/model";

const digest = (text: string) =>
  createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

let root: string;

async function writeMigration(filename: string, body: string) {
  await writeFile(join(root, "supabase", "migrations", filename), body, "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "qt-migration-evidence-"));
  await mkdir(join(root, "supabase", "migrations"), { recursive: true });
  await mkdir(join(root, "src", "database"), { recursive: true });
  await writeFile(join(root, "src", "database", "supabase_schema.sql"), "-- schema\n", "utf8");
  for (const filename of DESKTOP_SUPABASE_MIGRATION_FILENAMES) {
    await writeMigration(filename, `-- ${filename}\n`);
  }
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("desktop migration evidence collector", () => {
  it("observes every migration file in sorted order with raw-byte digests", async () => {
    const evidence = await collectDesktopSupabaseEvidence(root);

    expect(evidence.migrations).toStrictEqual(
      DESKTOP_SUPABASE_MIGRATION_FILENAMES.map((filename) => ({
        filename,
        sha256: digest(`-- ${filename}\n`),
      })),
    );
    expect(evidence.schema).toContain("-- schema");
  });

  it("reports an unpinned extra migration instead of hiding it", async () => {
    await writeMigration("20260902001100_unpinned_extra.sql", "-- extra\n");

    const evidence = await collectDesktopSupabaseEvidence(root);

    expect(evidence.migrations).toHaveLength(DESKTOP_SUPABASE_MIGRATION_FILENAMES.length + 1);
    expect(evidence.migrations?.map(({ filename }) => filename)).toContain(
      "20260902001100_unpinned_extra.sql",
    );
  });

  it("keeps observed order lexicographic so a reordered pin is detectable", async () => {
    await writeMigration("20260902000010_early_extra.sql", "-- early\n");

    const evidence = await collectDesktopSupabaseEvidence(root);
    const names = evidence.migrations?.map(({ filename }) => filename) ?? [];

    expect(names[1]).toBe("20260902000010_early_extra.sql");
    expect([...names]).toStrictEqual([...names].sort());
  });

  it("digests raw bytes so whitespace-only drift changes the digest", async () => {
    const [first] = DESKTOP_SUPABASE_MIGRATION_FILENAMES;
    const before = await collectDesktopSupabaseEvidence(root);
    await writeMigration(first as string, `-- ${first}\n\n`);
    const after = await collectDesktopSupabaseEvidence(root);

    expect(after.migrations?.[0]?.sha256).not.toBe(before.migrations?.[0]?.sha256);
  });

  it("ignores non-SQL files in the migrations directory", async () => {
    await writeFile(join(root, "supabase", "migrations", "README.md"), "notes\n", "utf8");

    const evidence = await collectDesktopSupabaseEvidence(root);

    expect(evidence.migrations).toHaveLength(DESKTOP_SUPABASE_MIGRATION_FILENAMES.length);
  });

  it("reports null evidence when the migrations directory is absent", async () => {
    await rm(join(root, "supabase", "migrations"), { recursive: true, force: true });

    await expect(collectDesktopSupabaseEvidence(root)).resolves.toStrictEqual({
      schema: null,
      migrations: null,
    });
  });

  it("still observes digests but withholds schema evidence when a pinned file is missing", async () => {
    await rm(
      resolve(root, "supabase/migrations", DESKTOP_SUPABASE_MIGRATION_FILENAMES[10] as string),
    );

    const evidence = await collectDesktopSupabaseEvidence(root);

    expect(evidence.schema).toBeNull();
    expect(evidence.migrations).toHaveLength(DESKTOP_SUPABASE_MIGRATION_FILENAMES.length - 1);
  });

  it("withholds schema evidence when the authoritative schema is absent", async () => {
    await rm(join(root, "src", "database", "supabase_schema.sql"));

    const evidence = await collectDesktopSupabaseEvidence(root);

    expect(evidence.schema).toBeNull();
    expect(evidence.migrations).toHaveLength(DESKTOP_SUPABASE_MIGRATION_FILENAMES.length);
  });
});
