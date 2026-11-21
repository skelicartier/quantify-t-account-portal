import type { Metadata } from "next";

import { AdminSupportConversation } from "@/components/admin/admin-support-conversation";
import { getAdminSupportConversationAccess } from "@/lib/admin/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

type AdminSupportConversationPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function AdminSupportConversationPage({
  params,
}: AdminSupportConversationPageProps) {
  const { conversationId } = await params;
  const access = await getAdminSupportConversationAccess(conversationId);

  return <AdminSupportConversation access={access} now={requestNow()} />;
}
