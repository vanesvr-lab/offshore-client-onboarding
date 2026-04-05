import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/shared/Navbar";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Admins should not be in the client portal
  const { data: adminRecord } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminRecord) redirect("/admin/dashboard");

  // Get personal name + company name via client association
  const [{ data: profile }, { data: clientUser }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("client_users")
      .select("clients(company_name)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const companyName =
    (clientUser?.clients as { company_name?: string } | null)?.company_name ??
    profile?.full_name;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role="client" userName={companyName} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
