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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, company_name")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        role="client"
        userName={profile?.company_name || profile?.full_name}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
