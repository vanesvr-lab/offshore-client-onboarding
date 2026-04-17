import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Clock, AlertCircle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

type ManagedService = {
  id: string;
  status: string;
  service_details: Record<string, unknown>;
  service_templates: { name: string; description: string | null; service_fields: unknown[] | null } | null;
  profile_service_roles: { can_manage: boolean }[];
};

function statusColors(status: string): string {
  const map: Record<string, string> = {
    draft: "text-gray-500",
    in_progress: "text-blue-600",
    submitted: "text-indigo-600",
    in_review: "text-amber-600",
    approved: "text-green-600",
    rejected: "text-red-600",
  };
  return map[status] ?? "text-gray-500";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "rejected") return <AlertCircle className="h-5 w-5 text-red-500" />;
  if (status === "in_review" || status === "submitted") return <Clock className="h-5 w-5 text-amber-500" />;
  return <Clock className="h-5 w-5 text-gray-300" />;
}

function getActionText(service: ManagedService): { text: string; urgent: boolean } {
  const status = service.status;
  if (status === "draft") {
    const fields = (service.service_templates?.service_fields ?? []) as Array<{ key: string; required?: boolean }>;
    const required = fields.filter((f) => f.required);
    const filled = required.filter((f) => {
      const v = service.service_details[f.key];
      if (Array.isArray(v)) return v.length > 0;
      return v != null && v !== "";
    });
    if (filled.length < required.length) {
      return { text: `${required.length - filled.length} required field${required.length - filled.length !== 1 ? "s" : ""} to complete`, urgent: true };
    }
    return { text: "Ready to submit", urgent: false };
  }
  if (status === "in_review") return { text: "Under review by our team", urgent: false };
  if (status === "submitted") return { text: "Submitted — awaiting review", urgent: false };
  if (status === "approved") return { text: "Approved", urgent: false };
  if (status === "rejected") return { text: "Rejected — contact us for details", urgent: true };
  return { text: "In progress", urgent: false };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const clientProfileId = session.user.clientProfileId;

  // New model: query managed services via profile_service_roles
  if (clientProfileId) {
    const supabase = createAdminClient();
    const tenantId = getTenantId(session);

    const { data: roleRows } = await supabase
      .from("profile_service_roles")
      .select(`
        service_id,
        services(
          id, status, service_details,
          service_templates(name, description, service_fields),
          profile_service_roles(can_manage)
        )
      `)
      .eq("client_profile_id", clientProfileId)
      .eq("can_manage", true)
      .eq("tenant_id", tenantId);

    // Collect unique services
    const seen = new Set<string>();
    const services: ManagedService[] = [];
    for (const row of roleRows ?? []) {
      const svc = (row.services as unknown) as ManagedService | null;
      if (svc && !seen.has(svc.id)) {
        seen.add(svc.id);
        services.push(svc);
      }
    }

    // Auto-redirect if exactly 1 service
    if (services.length === 1) {
      redirect(`/services/${services[0].id}`);
    }

    // 2+ services: show dashboard
    if (services.length > 1) {
      const userName = session.user.name ?? session.user.email ?? "there";
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-navy">Welcome back, {userName}</h1>
            <p className="text-sm text-gray-500 mt-1">
              You have access to {services.length} services.
            </p>
          </div>

          <div className="grid gap-4">
            {services.map((svc) => {
              const { text, urgent } = getActionText(svc);
              return (
                <Link key={svc.id} href={`/services/${svc.id}`}>
                  <Card className="hover:border-brand-blue hover:shadow-sm transition-all cursor-pointer">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <StatusIcon status={svc.status} />
                            <h2 className="font-semibold text-brand-navy">
                              {svc.service_templates?.name ?? "Service"}
                            </h2>
                          </div>
                          {svc.service_templates?.description && (
                            <p className="text-sm text-gray-500 mt-0.5 ml-7">{svc.service_templates.description}</p>
                          )}
                          <div className="ml-7 mt-1.5">
                            <span className={`text-xs font-medium capitalize ${statusColors(svc.status)}`}>
                              {svc.status.replace(/_/g, " ")}
                            </span>
                            <span className="text-gray-300 mx-2">·</span>
                            <span className={`text-xs ${urgent ? "text-amber-600 font-medium" : "text-gray-500"}`}>
                              {text}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-4 text-brand-blue">
                          <span className="text-sm font-medium">
                            {svc.status === "draft" ? "Continue" : "View"}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      );
    }

    // clientProfileId exists but no managed services → show empty state
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-3">
        <p className="text-lg font-semibold text-brand-navy">No services yet</p>
        <p className="text-sm text-gray-500">Your account manager will link services to your profile shortly.</p>
      </div>
    );
  }

  // Fallback: no clientProfileId (old-model user or admin viewing) — show legacy message
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-3">
      <p className="text-lg font-semibold text-brand-navy">Getting your account ready</p>
      <p className="text-sm text-gray-500">Your profile is being set up. Please check back shortly or contact your account manager.</p>
      <Link href="/kyc">
        <Button variant="outline">Complete your KYC</Button>
      </Link>
    </div>
  );
}
