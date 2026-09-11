import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The console speaks to people, not to the backend. Any of these tokens appearing inside
 * a JSX string literal is a developer-facing leak: an API name, an assurance level, a
 * storage detail, or a raw identifier label.
 */
const FORBIDDEN =
  /Account API|AAL2|AAL1|Source[- ]locked|[Cc]orrelation ID|UUID|Azure|blob storage/u;

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) collect(path, out);
    else if (/\.tsx$/u.test(entry)) out.push(path);
  }
  return out;
}

function renderedText(source: string): string {
  // Strip comments and imports; keep JSX text and string literals passed as props.
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/^import .*$/gmu, "");
}

describe("console copy", () => {
  const files = [...collect("src/components"), ...collect("src/app")];

  it.each(files)("%s contains no backend vocabulary in user-facing text", (file) => {
    const text = renderedText(readFileSync(file, "utf8"));
    const offending = text.split("\n").filter((line) => FORBIDDEN.test(line));
    expect(offending, offending.join("\n")).toEqual([]);
  });
});
