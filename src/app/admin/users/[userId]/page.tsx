import type { Metadata } from "next";

import {
  revokeAdminUserSession,
  updateAdminUserActivation,
} from "@/app/admin/users/[userId]/actions";
import { AdminUserDetail } from "@/components/admin/admin-user-detail";
import { getAdminUserDetailAccess } from "@/lib/admin/access";

export const metadata: Metadata = { title: "User Detail" };
export const dynamic = "force-dynamic";

type AdminUserDetailPageProps = {
  params: Promise<{ userId: string }>;
};

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { userId } = await params;
  const access = await getAdminUserDetailAccess(userId);

  return (
    <AdminUserDetail
      access={access}
      activationAction={updateAdminUserActivation}
      sessionRevokeAction={revokeAdminUserSession}
    />
  );
}
