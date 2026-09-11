import type { Metadata } from "next";

import {
  cancelAccountDeletion,
  requestAccountDeletion,
  requestAccountExport,
} from "@/app/account/data/actions";
import { AccountDataControls } from "@/components/account/account-data-controls";
import { requireCurrentAccountLifecycle } from "@/lib/dal/lifecycle";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Data" };
export const dynamic = "force-dynamic";

export default async function AccountDataPage() {
  const lifecycle = await requireCurrentAccountLifecycle();
  return (
    <AccountDataControls
      lifecycle={lifecycle}
      requestExportAction={requestAccountExport}
      requestDeletionAction={requestAccountDeletion}
      cancelDeletionAction={cancelAccountDeletion}
      now={requestNow()}
    />
  );
}
