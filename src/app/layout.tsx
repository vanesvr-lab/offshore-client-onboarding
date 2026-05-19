import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { TENANT_BRAND_DEFAULTS } from "@/lib/tenant-brand";

// B-129 Batch 7 — title is intentionally generic; per-tenant heading
// renders inside BrandedHeader (which reads session.user.tenantBrand).
// The static metadata title is shown on auth pages before any session
// has loaded, and we don't want to leak the tenant identity pre-auth.
export const metadata: Metadata = {
  title: "Client Portal",
  description: "The intelligent portal for client due diligence and compliance",
};

function hexToRgbTriplet(hex: string): string {
  const v = hex.replace(/^#/, "");
  if (v.length !== 6) return "30 58 138";
  return `${parseInt(v.slice(0, 2), 16)} ${parseInt(v.slice(2, 4), 16)} ${parseInt(v.slice(4, 6), 16)}`;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const brand = session?.user.tenantBrand ?? TENANT_BRAND_DEFAULTS;
  const primaryRgb = hexToRgbTriplet(brand.primary_color);

  return (
    <html
      lang="en"
      style={{ "--brand-primary": primaryRgb } as React.CSSProperties}
    >
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
