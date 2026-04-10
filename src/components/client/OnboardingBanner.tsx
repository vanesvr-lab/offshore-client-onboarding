"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight } from "lucide-react";

export type OnboardingStage =
  | "no_kyc"
  | "kyc_incomplete"
  | "kyc_complete_no_app"
  | "app_draft"
  | "app_submitted"
  | "app_approved"
  | "app_rejected";

interface OnboardingBannerProps {
  stage: OnboardingStage;
  kycPercentage?: number;
  appName?: string;
  appId?: string;
  templateId?: string;
}

interface StageConfig {
  bg: string;
  title: string;
  body: string;
  cta: { label: string; href: string } | null;
}

export function OnboardingBanner({
  stage,
  kycPercentage = 0,
  appName,
  appId,
  templateId,
}: OnboardingBannerProps) {
  const config: StageConfig = (() => {
    switch (stage) {
      case "no_kyc":
        return {
          bg: "bg-blue-50 border-blue-200",
          title: "Welcome! Let's get you set up.",
          body: "Complete your KYC profile to proceed with your onboarding.",
          cta: { label: "Complete KYC", href: "/kyc" },
        };
      case "kyc_incomplete":
        return {
          bg: "bg-amber-50 border-amber-200",
          title: `Your KYC profile is ${kycPercentage}% complete.`,
          body: "A few more details are needed before you can proceed.",
          cta: { label: "Continue KYC", href: "/kyc" },
        };
      case "kyc_complete_no_app":
        return {
          bg: "bg-green-50 border-green-200",
          title: "Your KYC profile is complete!",
          body: "You're ready to start your application.",
          cta: { label: "Start Application", href: "/apply" },
        };
      case "app_draft":
        return {
          bg: "bg-blue-50 border-blue-200",
          title: `Application${appName ? ` for ${appName}` : ""} in progress.`,
          body: "Continue filling out your application to submit it for review.",
          cta:
            templateId && appId
              ? {
                  label: "Continue Application",
                  href: `/apply/${templateId}/details?applicationId=${appId}`,
                }
              : { label: "My Applications", href: "/dashboard" },
        };
      case "app_submitted":
        return {
          bg: "bg-blue-50 border-blue-200",
          title: `Your application${appName ? ` for ${appName}` : ""} is under review.`,
          body: "Our team is reviewing your submission. You'll be notified of any updates.",
          cta: appId ? { label: "View Application", href: `/applications/${appId}` } : null,
        };
      case "app_approved":
        return {
          bg: "bg-green-50 border-green-200",
          title: `Congratulations! Your application${appName ? ` for ${appName}` : ""} has been approved.`,
          body: "We will be in touch shortly with the next steps.",
          cta: appId ? { label: "View Application", href: `/applications/${appId}` } : null,
        };
      case "app_rejected":
        return {
          bg: "bg-red-50 border-red-200",
          title: `Your application${appName ? ` for ${appName}` : ""} was not approved.`,
          body: "Please contact your account manager for more information.",
          cta: appId ? { label: "View Details", href: `/applications/${appId}` } : null,
        };
    }
  })();

  return (
    <div className={`rounded-lg border p-4 ${config.bg}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {stage === "app_approved" && (
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-semibold text-gray-800 text-sm">{config.title}</p>
            <p className="text-sm text-gray-600 mt-0.5">{config.body}</p>
          </div>
        </div>
        {config.cta && (
          <Link href={config.cta.href} className="shrink-0">
            <Button size="sm" variant="outline" className="bg-white gap-1.5">
              {config.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
