// B-102 — Admin Review Wizard route.
//
// Same data as the scroll page (`../page.tsx`), rendered through
// `ReviewWizardClient` which mounts `ServiceDetailClient` with
// `reviewMode={true}`. The `step` and `profile` URL params are read
// inside `ServiceDetailClient` so deep-linking / refresh preserve
// position with no server roundtrip.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { loadServiceDetail } from "../loadServiceDetail";
import { ReviewWizardClient } from "./ReviewWizardClient";

export const dynamic = "force-dynamic";

export default async function ServiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const tenantId = getTenantId(session);
  const payload = await loadServiceDetail(id, tenantId);

  return (
    <div>
      <ReviewWizardClient {...payload} currentUserId={session.user.id as string} />
    </div>
  );
}
