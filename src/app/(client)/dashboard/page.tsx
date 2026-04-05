import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/formatters";
import type { Application } from "@/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, full_name")
    .eq("id", user!.id)
    .single();

  const { data: applications } = await supabase
    .from("applications")
    .select("*, service_templates(name)")
    .eq("client_id", user!.id)
    .order("created_at", { ascending: false });

  type AppWithTemplate = Application & {
    service_templates?: { name: string };
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Welcome, {profile?.company_name || profile?.full_name}
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your GWMS onboarding applications
          </p>
        </div>
        <Link href="/apply">
          <Button className="bg-brand-navy hover:bg-brand-blue">
            Start new application
          </Button>
        </Link>
      </div>

      {!applications || applications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No applications yet
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              Start your GWMS onboarding by selecting the service you need
            </p>
            <Link href="/apply">
              <Button className="bg-brand-navy hover:bg-brand-blue">
                Start new application
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(applications as AppWithTemplate[]).map((app) => (
            <Card key={app.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-brand-navy">
                    {app.business_name || "Untitled Application"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {app.service_templates?.name}
                    {app.submitted_at &&
                      ` · Submitted ${formatDate(app.submitted_at)}`}
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
      )}
    </div>
  );
}
