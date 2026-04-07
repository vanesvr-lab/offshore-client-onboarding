import { CheckCircle2, Circle } from "lucide-react";
import type { ApplicationStatus } from "@/types";

interface Requirement {
  id: string;
  name: string;
  category: string;
}

interface Upload {
  requirement_id: string;
  uploaded_at: string;
  file_name?: string | null;
}

interface AppContext {
  business_name: string | null;
  business_type: string | null;
  business_country: string | null;
  ubo_data: unknown;
  admin_notes: string | null;
}

export interface StageTaskData {
  requirements: Requirement[];
  uploads: Upload[];
  application: AppContext;
}

interface Task {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string | null;
}

const STAGE_HEADING: Partial<Record<ApplicationStatus, string>> = {
  draft: "Getting Started",
  submitted: "Submitted — Under Review",
  in_review: "Active Review",
  pending_action: "Action Required",
  verification: "Compliance Verification",
  approved: "Application Complete",
  rejected: "Application Closed",
};

const VERIFICATION_ITEMS = [
  "Identity documents verified",
  "Business registration confirmed",
  "Source of funds reviewed",
  "UBO declarations cross-checked",
  "PEP/sanctions screening complete",
  "Risk assessment completed",
];

function deriveTasks(
  status: ApplicationStatus,
  requirements: Requirement[],
  uploads: Upload[],
  app: AppContext
): Task[] {
  const uploadedIds = new Set(uploads.map((u) => u.requirement_id));
  const uploadMap = new Map(uploads.map((u) => [u.requirement_id, u]));

  if (status === "draft") {
    const hasDetails = !!(
      app.business_name &&
      app.business_type &&
      app.business_country
    );
    const hasUBO =
      Array.isArray(app.ubo_data) && (app.ubo_data as unknown[]).length > 0;
    return [
      { id: "biz-details", label: "Complete business details", completed: hasDetails },
      { id: "ubo-info", label: "Add UBO information", completed: hasUBO },
    ];
  }

  if (status === "verification") {
    return VERIFICATION_ITEMS.map((label, i) => ({
      id: `verify-${i}`,
      label,
      completed: false, // placeholder — automation coming in v2
    }));
  }

  if (status === "pending_action") {
    const tasks: Task[] = requirements.map((req) => {
      const upload = uploadMap.get(req.id);
      return {
        id: req.id,
        label: req.name,
        completed: uploadedIds.has(req.id),
        completedAt: upload?.uploaded_at ?? null,
      };
    });
    if (app.admin_notes) {
      tasks.unshift({
        id: "admin-action",
        label: app.admin_notes,
        completed: false,
      });
    }
    return tasks;
  }

  // submitted, in_review, approved, rejected — show document tasks
  return requirements.map((req) => {
    const upload = uploadMap.get(req.id);
    return {
      id: req.id,
      label: req.name,
      completed: uploadedIds.has(req.id),
      completedAt: upload?.uploaded_at ?? null,
    };
  });
}

interface StageTaskListProps {
  status: ApplicationStatus;
  data: StageTaskData;
}

export function StageTaskList({ status, data }: StageTaskListProps) {
  const { requirements, uploads, application } = data;

  // Nothing to show for approved/rejected with no reqs and not draft/verification
  if (
    requirements.length === 0 &&
    status !== "draft" &&
    status !== "verification" &&
    status !== "pending_action"
  ) {
    return null;
  }

  const tasks = deriveTasks(status, requirements, uploads, application);
  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.completed);
  const todo = tasks.filter((t) => !t.completed);
  const progress = Math.round((completed.length / tasks.length) * 100);

  return (
    <div className="mt-5 pt-5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-brand-navy">
          {STAGE_HEADING[status] ?? "Current Stage"}
        </h3>
        <span className="text-xs text-gray-400">
          {completed.length}/{tasks.length} complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-gray-100 mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-navy transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {todo.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            To Do
          </p>
          <ul className="space-y-1.5">
            {todo.map((task) => (
              <li key={task.id} className="flex items-start gap-2 text-sm text-gray-700">
                <Circle className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                <span>{task.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Completed
          </p>
          <ul className="space-y-1.5">
            {completed.map((task) => (
              <li key={task.id} className="flex items-start gap-2 text-sm text-gray-500">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span className="line-through">{task.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
