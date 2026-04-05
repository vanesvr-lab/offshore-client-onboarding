import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatActionLabel } from "@/lib/utils/formatters";
import Link from "next/link";
import type { AuditLogEntry } from "@/types";

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const [
    { count: total },
    { count: pending },
    { count: awaitingClient },
    { count: approvedThisMonth },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .neq("status", "draft"),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .in("status", ["submitted", "in_review"]),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_action"),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .gte(
        "approved_at",
        new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1
        ).toISOString()
      ),
    supabase
      .from("audit_log")
      .select("*, profiles(full_name), applications(business_name)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stats = [
    { label: "Total applications", value: total || 0, color: "text-brand-navy" },
    { label: "Pending review", value: pending || 0, color: "text-yellow-600" },
    {
      label: "Awaiting client action",
      value: awaitingClient || 0,
      color: "text-orange-600",
    },
    {
      label: "Approved this month",
      value: approvedThisMonth || 0,
      color: "text-green-600",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Overview of all onboarding applications
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-brand-navy">Recent Activity</CardTitle>
              <Link
                href="/admin/queue"
                className="text-sm text-brand-blue hover:underline"
              >
                View all →
              </Link>
            </CardHeader>
            <CardContent>
              {!recentActivity || recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No activity yet
                </p>
              ) : (
                <ul className="divide-y">
                  {recentActivity.map((entry) => {
                    const e = entry as AuditLogEntry & {
                      profiles?: { full_name: string };
                      applications?: { business_name: string };
                    };
                    return (
                      <li
                        key={e.id}
                        className="py-3 text-sm flex items-start justify-between"
                      >
                        <div>
                          <span className="font-medium">
                            {formatActionLabel(e.action)}
                          </span>
                          {e.applications?.business_name && (
                            <span className="text-gray-500">
                              {" "}
                              — {e.applications.business_name}
                            </span>
                          )}
                          {e.profiles?.full_name && (
                            <p className="text-xs text-gray-400">
                              by {e.profiles.full_name}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 ml-4">
                          {formatDateTime(e.created_at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick links */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/admin/queue"
                className="block rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-brand-navy">Review Queue</p>
                <p className="text-gray-500 text-xs">
                  Review submitted applications
                </p>
              </Link>
              <Link
                href="/admin/settings/templates"
                className="block rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-brand-navy">Templates</p>
                <p className="text-gray-500 text-xs">
                  Manage document checklists
                </p>
              </Link>
              <Link
                href="/admin/settings/rules"
                className="block rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium text-brand-navy">
                  Verification Rules
                </p>
                <p className="text-gray-500 text-xs">
                  Edit AI verification rules
                </p>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
