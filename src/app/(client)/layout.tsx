import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Navbar } from "@/components/shared/Navbar";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");

  const supabase = createAdminClient();
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("clients(company_name)")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const companyName =
    (clientUser?.clients as { company_name?: string } | null)?.company_name ??
    session.user.name;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role="client" userName={companyName} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
