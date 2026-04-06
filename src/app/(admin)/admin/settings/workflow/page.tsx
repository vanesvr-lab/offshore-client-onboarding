import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import type { ApplicationStatus } from "@/types";

const WORKFLOW_DESCRIPTION: Record<ApplicationStatus, string> = {
  draft: "Client has started the application but not yet submitted it. The application is editable.",
  submitted:
    "Client submitted the application. It now appears in the admin review queue.",
  in_review:
    "An admin has opened the application and is actively reviewing it.",
  pending_action:
    "Admin has flagged an issue. The client is notified and must re-upload documents or take action.",
  verification:
    "Application passed initial review and is undergoing final compliance checks.",
  approved:
    "Application fully approved. Client is notified of the outcome.",
  rejected:
    "Application has been rejected. The rejection reason is shown to the client.",
};

const STAGES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "pending_action",
  "verification",
  "approved",
  "rejected",
];

export default function WorkflowPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">
          Workflow Stages
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Fixed workflow stages for the onboarding process. Stage
          customization coming in v2.
        </p>
      </div>
      <div className="space-y-3 max-w-2xl">
        {STAGES.map((stage, idx) => (
          <Card key={stage}>
            <CardContent className="flex items-start gap-4 pt-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white text-sm font-medium">
                {idx + 1}
              </div>
              <div>
                <p className="font-medium text-brand-navy">
                  {APPLICATION_STATUS_LABELS[stage]}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {WORKFLOW_DESCRIPTION[stage]}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
