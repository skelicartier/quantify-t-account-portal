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

const supabaseUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      !isBareOrigin(url)
    ) {
      context.addIssue({
        code: "custom",
        message: "Supabase URL must be a bare HTTPS project origin under supabase.co",
      });
    }
  });

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SITE_URL: siteUrlSchema,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(
      /^sb_publishable_[A-Za-z0-9._-]{8,}$/,
      "A Supabase publishable key is required; secret/service-role keys are forbidden",
    ),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(3),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  environment: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SITE_URL: environment.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: environment.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
}
