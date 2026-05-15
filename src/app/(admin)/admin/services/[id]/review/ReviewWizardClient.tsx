// B-102 — Review Wizard client wrapper.
//
// Reads `?step=N` from the URL and mounts `ServiceDetailClient` with
// `reviewMode={true}`. ServiceDetailClient owns the wizard chrome (top
// bar + bottom nav) and the per-step section visibility — see the
// `reviewMode` branches in that file. We deliberately reuse the scroll
// page's component instead of forking it so every existing edit field,
// save mechanism, and dirty tracker carries over for free (path A in
// the brief).

"use client";

import { useSearchParams } from "next/navigation";
import { ServiceDetailClient } from "../ServiceDetailClient";
import type { ServiceDetailPayload } from "../loadServiceDetail";

export function ReviewWizardClient(
  props: ServiceDetailPayload & { currentUserId: string },
) {
  const searchParams = useSearchParams();
  const stepRaw = searchParams.get("step");
  const parsed = stepRaw ? parseInt(stepRaw, 10) : 0;
  const step = Number.isFinite(parsed) && parsed >= 0 && parsed < 5 ? parsed : 0;

  return <ServiceDetailClient {...props} reviewMode reviewStep={step} />;
}
