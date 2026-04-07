import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .single();

  const userName = profile?.full_name ?? session.user.name;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header userName={userName} />
      <div className="flex flex-1 min-h-0">
        <Sidebar role="admin" userName={userName} />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
