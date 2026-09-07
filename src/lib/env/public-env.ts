import { z } from "zod";

function isBareOrigin(url: URL): boolean {
  return (
    url.username === "" &&
    url.password === "" &&
    (url.pathname === "" || url.pathname === "/") &&
    url.search === "" &&
    url.hash === ""
  );
}

const siteUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (!isLocal && url.protocol !== "https:") ||
      (isLocal && !["http:", "https:"].includes(url.protocol))
    ) {
      context.addIssue({ code: "custom", message: "Site URL must use an approved origin" });
    }
    if (!isBareOrigin(url)) {
      context.addIssue({
        code: "custom",
        message: "Site URL must be an origin without credentials or a path",
      });
    }
  });

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SITE_URL: siteUrlSchema,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(3).optional().default(""),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  environment: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SITE_URL: environment.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
}
