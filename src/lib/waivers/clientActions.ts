// B-107 — shared client-side waive / un-waive handlers. Extracted from
// `KycDocumentsTable.tsx` so the per-profile `KycDocsByCategory` rows can
// reuse the exact same logic without duplicating fetch + audit semantics.
//
// Both helpers:
//   - Mutate the parent's `waivers` state optimistically via `onChange`
//   - POST / DELETE the waiver to `/api/admin/services/:id/waive-document`
//   - Roll back via `onChange(prev)` on failure
//   - Toast the result (top-right)
//
// Scope is fixed to "person" — service-scope waivers (no profile id) are
// handled inline in `AdminDocumentsSection`'s Service Docs tab because
// they share state with a different optimistic structure.

import { toast } from "sonner";
import type { WaivedDocumentRequirement } from "@/app/(admin)/admin/services/[id]/page";

interface PersonWaiveOpts {
  serviceId: string;
  profileId: string;
  documentTypeId: string;
  prev: WaivedDocumentRequirement[];
  onChange: (next: WaivedDocumentRequirement[]) => void;
}

function withoutPersonWaiver(
  list: WaivedDocumentRequirement[],
  profileId: string,
  documentTypeId: string,
): WaivedDocumentRequirement[] {
  return list.filter(
    (w) =>
      !(
        w.scope === "person" &&
        w.client_profile_id === profileId &&
        w.document_type_id === documentTypeId
      ),
  );
}

export async function waiveDocument({
  serviceId,
  profileId,
  documentTypeId,
  prev,
  onChange,
}: PersonWaiveOpts): Promise<boolean> {
  const optimistic: WaivedDocumentRequirement = {
    id: `optimistic-${profileId}-${documentTypeId}`,
    client_profile_id: profileId,
    document_type_id: documentTypeId,
    waived_at: new Date().toISOString(),
    waived_by: "",
    scope: "person",
  };
  onChange([...withoutPersonWaiver(prev, profileId, documentTypeId), optimistic]);
  try {
    const res = await fetch(`/api/admin/services/${serviceId}/waive-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "person",
        client_profile_id: profileId,
        document_type_id: documentTypeId,
      }),
    });
    const data = (await res.json()) as {
      data?: WaivedDocumentRequirement;
      error?: string;
    };
    if (!res.ok || !data.data) throw new Error(data.error ?? "Waive failed");
    onChange([
      ...withoutPersonWaiver(prev, profileId, documentTypeId),
      data.data,
    ]);
    toast.success("Document waived", { position: "top-right" });
    return true;
  } catch (err) {
    onChange(prev);
    toast.error(err instanceof Error ? err.message : "Waive failed", {
      position: "top-right",
    });
    return false;
  }
}

export async function unwaiveDocument({
  serviceId,
  profileId,
  documentTypeId,
  prev,
  onChange,
}: PersonWaiveOpts): Promise<boolean> {
  onChange(withoutPersonWaiver(prev, profileId, documentTypeId));
  try {
    const res = await fetch(`/api/admin/services/${serviceId}/waive-document`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "person",
        client_profile_id: profileId,
        document_type_id: documentTypeId,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Un-waive failed");
    toast.success("Document un-waived", { position: "top-right" });
    return true;
  } catch (err) {
    onChange(prev);
    toast.error(err instanceof Error ? err.message : "Un-waive failed", {
      position: "top-right",
    });
    return false;
  }
}
