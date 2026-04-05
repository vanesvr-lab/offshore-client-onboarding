import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils/formatters";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const [
    { count: total },
    { count: submitted },
    { count: pendingAction },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_action"),
    supabase
      .from("audit_log")
      .select(
        "id, action, created_at, actor_id, application_id, applications(business_name)"
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Approved this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { count: approvedThisMonth } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .gte("updated_at", startOfMonth.toISOString());

  const stats = [
    { label: "Total Applications", value: total ?? 0, href: "/admin/queue" },
    { label: "Awaiting Review", value: submitted ?? 0, href: "/admin/queue?status=submitted" },
    { label: "Awaiting Client", value: pendingAction ?? 0, href: "/admin/queue?status=pending_action" },
    { label: "Approved This Month", value: approvedThisMonth ?? 0, href: "/admin/queue?status=approved" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Overview of the onboarding pipeline
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:border-brand-navy/30 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-brand-navy">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity && recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.map((entry) => {
                    const app = entry.applications as { business_name?: string } | null;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 text-sm"
                      >
                        <div className="h-2 w-2 rounded-full bg-brand-navy mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700">
                            <span className="font-medium capitalize">
                              {entry.action.replace(/_/g, " ")}
                            </span>
                            {app?.business_name && (
                              <span className="text-gray-500">
                                {" "}
                                —{" "}
                                <Link
                                  href={`/admin/applications/${entry.application_id}`}
                                  className="hover:text-brand-blue underline"
                                >
                                  {app.business_name}
                                </Link>
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatDateTime(entry.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">
                Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Review Queue", href: "/admin/queue" },
                { label: "Service Templates", href: "/admin/settings/templates" },
                { label: "Verification Rules", href: "/admin/settings/rules" },
                { label: "Workflow Stages", href: "/admin/settings/workflow" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg border border-gray-200 px-3 py-2 text-sm text-brand-navy hover:bg-gray-50 hover:border-brand-navy/30 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
