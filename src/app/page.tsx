import { redirect } from "next/navigation";

import { devAutologinPersona } from "@/lib/auth/dev-bypass";

export default function HomePage() {
  // Development only: the demo opens on the account, signed in.
  if (devAutologinPersona()) redirect("/dev/signin?next=%2Faccount");
  redirect("/login");
}
