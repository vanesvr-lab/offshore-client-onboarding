// B-101 Batch 5 — brand mark.
// B-129 Batch 5 — tenant logo_url override.
//
// Falls back to /public/brand-logo.png when the tenant has no
// custom logo_url set in tenants.settings. Both paths use the same
// onError → lucide Landmark fallback so the layout never breaks.

"use client";

import Image from "next/image";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Landmark } from "lucide-react";
import { TENANT_BRAND_DEFAULTS } from "@/lib/tenant-brand";

interface Props {
  size?: number;
  className?: string;
  /** Optional override — pass a lucide accent color when used on dark
   *  surfaces like the sidebar. Falls back to `text-brand-navy`. */
  fallbackClassName?: string;
}

export function BrandMark({ size = 32, className, fallbackClassName }: Props) {
  const [errored, setErrored] = useState(false);
  const { data: session } = useSession();
  const brand = session?.user.tenantBrand ?? TENANT_BRAND_DEFAULTS;
  const src = brand.logo_url ?? "/brand-logo.png";
  const alt = brand.display_name || "Brand";

  if (errored) {
    return (
      <Landmark
        className={fallbackClassName ?? "text-brand-navy"}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setErrored(true)}
      priority
      unoptimized
    />
  );
}
