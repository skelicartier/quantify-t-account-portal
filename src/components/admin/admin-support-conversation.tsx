import Link from "next/link";

import { manageSupportConversation, replyToSupportConversation } from "@/app/admin/support/actions";
import { AdminGate } from "@/components/admin/admin-gate";
import { AdminSupportManageForm } from "@/components/admin/admin-support-manage-form";
import { AdminSupportReplyForm } from "@/components/admin/admin-support-reply-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminSupportConversationAccess } from "@/lib/admin/access";
import type { AccountApiSupportConversation } from "@/lib/admin/account-api";
import {
  supportPriorityLabel,
  supportPriorityTone,
  supportStatusLabel,
  supportStatusTone,
} from "@/lib/admin/support-input";

type AdminSupportConversationProps = {
  access: AdminSupportConversationAccess;
  now?: number | undefined;
};

type Message = AccountApiSupportConversation["messages"][number];

function authorLabel(message: Message): string {
  if (message.author === "customer") return "Customer";
  if (message.author === "staff") return message.author_name || "Support";
  return "System";
}

/**
 * One message.
 *
 * A system note is a change somebody made to the queue, not something anybody said, so it
 * is set apart rather than rendered as a reply from a person nobody can answer.
 */
function Message({ message, now }: { message: Message; now?: number | undefined }) {
  const isNote = message.author !== "customer" && message.author !== "staff";
  return (
    <li className={isNote ? "thread__note" : "thread__message"}>
      <p className="thread__meta">
        <span className="thread__author">{authorLabel(message)}</span>
        <Timestamp value={message.at} now={now} />
      </p>
      {/* Plain text. A conversation is the one place in the console that renders words
          somebody outside it wrote, and React escaping is what keeps it that way. */}
      <p className="thread__body">{message.body}</p>
    </li>
  );
}

export function AdminSupportConversation({ access, now }: AdminSupportConversationProps) {
  const authorized = access.status === "authorized" ? access : null;
  const conversation = authorized?.conversation ?? null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/support">Support</Link>}
        title={conversation?.subject ?? "Conversation"}
        titleId="admin-support-conversation-heading"
        description="Everything the customer has sent, and everything the desk has answered."
        meta={
          conversation ? (
            <>
              <StatusPill
                value={conversation.status}
                label={supportStatusLabel(conversation.status)}
                tone={supportStatusTone(conversation.status)}
              />
              <StatusPill
                value={conversation.priority}
                label={supportPriorityLabel(conversation.priority)}
                tone={supportPriorityTone(conversation.priority)}
              />
              {/* A customer who is at their keyboard replies in seconds, so this is
                  checked more often than the queue. It stops while the desk is typing. */}
              <LiveRefresh label="Conversation" intervalSeconds={15} />
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {access.status === "unavailable" ? (
          <Callout tone="danger" role="alert">
            This conversation could not be read. Reload in a moment, and check the account service
            if it persists.
          </Callout>
        ) : (
          <AdminGate access={access} section="Support">
            {conversation && authorized && (
              <div className="board">
                <Card
                  title="Conversation"
                  titleId="support-thread-heading"
                  description="Oldest first, the way it was written."
                >
                  <ul className="thread">
                    {conversation.messages.map((message) => (
                      <Message key={message.id} message={message} now={now} />
                    ))}
                  </ul>
                  {authorized.canReply ? (
                    <AdminSupportReplyForm
                      conversationId={conversation.id}
                      action={replyToSupportConversation}
                    />
                  ) : (
                    <Callout tone="neutral" compact>
                      This account can read the desk but not answer it.
                    </Callout>
                  )}
                </Card>

                <Card title="About this account" titleId="support-context-heading">
                  <KeyValue>
                    <KeyValueRow label="Customer">
                      {conversation.account_email || <span className="quiet">Not recorded</span>}
                    </KeyValueRow>
                    <KeyValueRow label="Account">
                      <ShortId
                        value={conversation.account_id}
                        href={`/admin/users/${conversation.account_id}`}
                        full
                      />
                    </KeyValueRow>
                    <KeyValueRow label="App version">
                      {conversation.app_version || <span className="quiet">Not reported</span>}
                    </KeyValueRow>
                    <KeyValueRow label="Platform">
                      {conversation.platform || <span className="quiet">Not reported</span>}
                    </KeyValueRow>
                    <KeyValueRow label="Opened">
                      <Timestamp value={conversation.created_at} now={now} />
                    </KeyValueRow>
                    <KeyValueRow label="Last activity">
                      <Timestamp value={conversation.updated_at} now={now} />
                    </KeyValueRow>
                    <KeyValueRow label="Assigned to">
                      {conversation.assignee_id ? (
                        conversation.assignee_name || <ShortId value={conversation.assignee_id} />
                      ) : (
                        <span className="quiet">Unassigned</span>
                      )}
                    </KeyValueRow>
                  </KeyValue>
                </Card>

                {authorized.canManage && (
                  <Card
                    title="Run the queue"
                    titleId="support-manage-heading"
                    description="Assigning, prioritising and closing are recorded in the thread. None of them answers the customer."
                  >
                    <AdminSupportManageForm
                      conversationId={conversation.id}
                      assigneeId={conversation.assignee_id}
                      status={conversation.status}
                      priority={conversation.priority}
                      action={manageSupportConversation}
                    />
                  </Card>
                )}
              </div>
            )}
          </AdminGate>
        )}
      </div>
    </>
  );
}
