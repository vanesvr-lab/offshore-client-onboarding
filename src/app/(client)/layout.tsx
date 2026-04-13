import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");

  const isPrimary = session.user.is_primary !== false; // true by default for legacy logins

  const supabase = createAdminClient();

  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id, clients(company_name)")
    .eq("user_id", session.user.id)
    .maybeSingle();

  // Non-primary: use their own name from kyc_records if available
  let displayName = session.user.name;
  if (!isPrimary && session.user.kycRecordId) {
    const { data: kycRecord } = await supabase
      .from("kyc_records")
      .select("full_name")
      .eq("id", session.user.kycRecordId)
      .maybeSingle();
    if (kycRecord?.full_name) displayName = kycRecord.full_name;
  }

  const companyName = isPrimary
    ? ((clientUser?.clients as { company_name?: string } | null)?.company_name ?? displayName)
    : displayName;

  // Check if client has any applications (for "My Applications" sidebar item) — primary only
  const { count: appCount } = isPrimary && clientUser?.client_id
    ? await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientUser.client_id)
    : { count: 0 };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header userName={companyName} />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          role="client"
          userName={companyName}
          hasApplications={(appCount ?? 0) > 0}
          isPrimary={isPrimary}
        />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
