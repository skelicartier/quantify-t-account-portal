"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isCredentialRejection, parseLoginFormData, type LoginActionState } from "@/lib/auth/login";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const AUTHENTICATION_ERROR: LoginActionState = {
  status: "error",
  message: "Unable to sign in with those credentials.",
  fieldErrors: { email: [], password: [] },
};

const SERVICE_ERROR: LoginActionState = {
  status: "error",
  message: "Secure sign-in is temporarily unavailable. Please try again.",
  fieldErrors: { email: [], password: [] },
};

export async function login(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = parseLoginFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) return isCredentialRejection(error) ? AUTHENTICATION_ERROR : SERVICE_ERROR;
  } catch {
    return SERVICE_ERROR;
  }

  revalidatePath("/", "layout");
  redirect(parsed.data.nextPath);
}
