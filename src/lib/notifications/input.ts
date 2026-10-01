import { z } from "zod";

const httpsUrl = z.union([
  z.literal(""),
  z
    .url({ protocol: /^https$/u })
    .max(500)
    .refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password;
    }),
]);
export type NotificationActionState = { status: "idle" | "success" | "error"; message: string };
export const INITIAL_NOTIFICATION_STATE: NotificationActionState = { status: "idle", message: "" };

export function safeNotificationHref(value: string): string | null {
  return value && httpsUrl.safeParse(value).success ? value : null;
}
