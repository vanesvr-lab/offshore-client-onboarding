import Link from "next/link";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ActivityFeed } from "@/components/shared/ActivityFeed";
import type { ActivityEntry } from "@/components/shared/ActivityFeed";
import { formatDate } from "@/lib/utils/formatters";
import type { Application } from "@/types";

export default async function DashboardPage() {
  const session = await auth();
  const supabase = createAdminClient();

  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id, clients(company_name)")
    .eq("user_id", session!.user.id)
    .maybeSingle();

  const companyName =
    (clientUser?.clients as { company_name?: string } | null)?.company_name;

  const { data: applications } = clientUser
    ? await supabase
        .from("applications")
        .select("*, service_templates(name)")
        .eq("client_id", clientUser.client_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  type AppWithTemplate = Application & { service_templates?: { name: string } };
  const apps = (applications || []) as AppWithTemplate[];

  // Activity feed: audit_log entries for this client's apps
  const appIds = apps.map((a) => a.id);
  const { data: rawActivity } = appIds.length > 0
    ? await supabase
        .from("audit_log")
        .select("id, action, actor_name, actor_role, created_at, application_id, detail, applications(business_name)")
        .in("application_id", appIds)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] };

  const activityEntries: ActivityEntry[] = (rawActivity || []).map((entry) => {
    const app = entry.applications as { business_name?: string | null } | null;
    return {
      id: entry.id,
      action: entry.action,
      actor_name: entry.actor_name,
      actor_role: entry.actor_role,
      created_at: entry.created_at,
      application_id: entry.application_id,
      detail: entry.detail as Record<string, unknown> | null,
      applicationName: app?.business_name ?? null,
      applicationHref: entry.application_id
        ? `/applications/${entry.application_id}`
        : null,
    };
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Welcome{companyName ? `, ${companyName}` : ""}
          </h1>
          <p className="text-gray-500 mt-1">Manage your onboarding applications</p>
        </div>
        <Link href="/apply">
          <Button className="bg-brand-navy hover:bg-brand-blue">
            Start new application
          </Button>
        </Link>
      </div>

      {apps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No applications yet</h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              Start your onboarding by selecting the service you need
            </p>
            <Link href="/apply">
              <Button className="bg-brand-navy hover:bg-brand-blue">Start new application</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Applications list */}
          <div className="lg:col-span-2 space-y-3">
            {apps.map((app) => (
              <Card key={app.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium text-brand-navy">
                      {app.business_name || "Untitled Application"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {app.service_templates?.name}
                      {app.submitted_at && ` · Submitted ${formatDate(app.submitted_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={app.status} />
                    <Link
                      href={
                        app.status === "draft"
                          ? `/apply/${app.template_id}/details?applicationId=${app.id}`
                          : `/applications/${app.id}`
                      }
                    >
                      <Button variant="outline" size="sm">
                        {app.status === "draft" ? "Continue" : "View"}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Activity feed */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-brand-navy">Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityFeed entries={activityEntries} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
