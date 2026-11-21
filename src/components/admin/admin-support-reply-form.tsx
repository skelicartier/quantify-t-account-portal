"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Textarea } from "@/components/ui/field";
import {
  INITIAL_ADMIN_SUPPORT_STATE,
  SUPPORT_REPLY_MAX_LENGTH,
  type AdminSupportActionState,
} from "@/lib/admin/support-input";

type SupportAction = (
  state: AdminSupportActionState,
  formData: FormData,
) => Promise<AdminSupportActionState>;

type AdminSupportReplyFormProps = {
  conversationId: string;
  action: SupportAction;
};

/**
 * The desk's reply box.
 *
 * Uncontrolled and cleared only on success. A reply that failed to send is the one thing
 * on this page nobody wants to retype: the browser is already holding the text, and
 * clearing it would cost an answer somebody just wrote to save nothing.
 */
export function AdminSupportReplyForm({ conversationId, action }: AdminSupportReplyFormProps) {
  const [state, submit, pending] = useActionState(action, INITIAL_ADMIN_SUPPORT_STATE);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <form className="stack" action={submit} ref={form}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <Field
        id={`support-reply-${conversationId}`}
        label="Reply to the customer"
        hint="This reaches them in the app and in their account portal."
      >
        <Textarea
          id={`support-reply-${conversationId}`}
          name="body"
          rows={5}
          maxLength={SUPPORT_REPLY_MAX_LENGTH}
          required
          disabled={pending}
          placeholder="Answer the question they actually asked, then say what happens next."
        />
      </Field>
      {state.message && (
        <Callout
          tone={state.status === "success" ? "success" : "danger"}
          role={state.status === "success" ? "status" : "alert"}
          compact
        >
          {state.message}
          {state.status === "error" && " What you typed is still in the box."}
        </Callout>
      )}
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
