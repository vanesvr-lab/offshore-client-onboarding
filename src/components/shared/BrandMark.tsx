// B-101 Batch 5 — brand mark.
//
// 1x1 image at `/public/brand-logo.png`. Renders via next/image with the
// requested pixel size. If the file ever goes missing the broken image
// fallback hides itself via onError — the sibling layout keeps working
// because the parent already sizes the slot.

"use client";

import Image from "next/image";
import { useState } from "react";
import { Landmark } from "lucide-react";

interface Props {
  size?: number;
  className?: string;
  /** Optional override — pass a lucide accent color when used on dark
   *  surfaces like the sidebar. Falls back to `text-brand-navy`. */
  fallbackClassName?: string;
}

export function BrandMark({ size = 32, className, fallbackClassName }: Props) {
  const [errored, setErrored] = useState(false);

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
      src="/brand-logo.png"
      alt="Mauritius Offshore"
      width={size}
      height={size}
      className={className}
      onError={() => setErrored(true)}
      priority
    />
  );
}
