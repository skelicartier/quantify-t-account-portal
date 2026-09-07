import { resolve } from "node:path";

/**
 * One resolver for the desktop checkout location.
 *
 * `QT_DESKTOP_PROJECT_PATH` was previously interpreted two ways — resolved directly by the
 * preflight script and against the parent of the working directory by a test — so the same
 * documented value (`../Quantify Terminal`) pointed at two different directories. A single
 * function means the evidence collector and every test that reads the same files agree
 * about which files those are.
 */
export function resolveDesktopRoot(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
  portalRoot: string = process.cwd(),
): string {
  const configured = String(environment.QT_DESKTOP_PROJECT_PATH ?? "").trim();
  const projectsRoot = resolve(portalRoot, "..");
  // Relative values resolve against the portal root, which is how the documented
  // `../Quantify Terminal` example is meant to be read.
  return configured ? resolve(portalRoot, configured) : resolve(projectsRoot, "Quantify Terminal");
}
