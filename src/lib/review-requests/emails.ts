// B-118 — Resend email + service_communications log for the peer-review
// flow. One helper per event so the route handlers stay short.

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logCommunication } from "@/lib/email/logCommunication";
import { formatFooter, type TenantBrand } from "@/lib/tenant-brand";
import {
  SECTION_LABELS,
  PEOPLE_KYC_PROFILE_KEY,
  isTopLevelSectionKey,
} from "./sections";
import type { ReviewSectionKey } from "./sections";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface ProfileLite {
  id: string;
  full_name: string | null;
}

export interface EmailSection {
  section_key: ReviewSectionKey;
  profile_id: string | null;
}

function fromHeader(brand: TenantBrand): string {
  return `${brand.portal_name} <${process.env.RESEND_FROM_EMAIL!}>`;
}

function reviewLink(serviceId: string, requestId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/admin/services/${serviceId}?reviewRequest=${requestId}`;
}

function sectionLineItems(
  sections: EmailSection[],
  profilesById: Map<string, ProfileLite>,
): string {
  if (sections.length === 0) return "<li>(no sections specified)</li>";
  return sections
    .map((s) => {
      if (s.section_key === PEOPLE_KYC_PROFILE_KEY) {
        const name = s.profile_id
          ? profilesById.get(s.profile_id)?.full_name ?? "Unknown profile"
          : "Unknown profile";
        return `<li>People &amp; KYC — ${escapeHtml(name)}</li>`;
      }
      if (isTopLevelSectionKey(s.section_key)) {
        return `<li>${escapeHtml(SECTION_LABELS[s.section_key])}</li>`;
      }
      return `<li>${escapeHtml(s.section_key)}</li>`;
    })
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function envelope(inner: string, brand: TenantBrand): string {
  const footerLine = formatFooter(brand) || brand.portal_name;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a365d; padding: 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px;">${brand.portal_name}</h1>
        <p style="color: #90cdf4; margin: 6px 0 0; font-size: 13px;">Internal Review</p>
      </div>
      <div style="padding: 36px; background: #ffffff;">
        ${inner}
      </div>
      <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
        ${footerLine}
      </div>
    </div>
  `;
}

function ctaButton(href: string, label: string): string {
  return `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${href}"
         style="background: #1a365d; color: white; padding: 14px 32px; border-radius: 6px;
                text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
        ${label} →
      </a>
    </div>
  `;
}

interface SendCreatedArgs {
  supabase: SupabaseClient;
  tenantId: string;
  brand: TenantBrand;
  serviceId: string;
  serviceNumber: string | null;
  requesterId: string;
  requesterName: string;
  requesterEmail: string | null;
  reviewers: Array<{ admin_id: string; full_name: string | null; email: string | null }>;
  sections: EmailSection[];
  profilesById: Map<string, ProfileLite>;
  note: string;
  requestId: string;
}

export async function sendReviewRequestCreatedEmails(
  args: SendCreatedArgs,
): Promise<Record<string, unknown>[]> {
  const commRows: Record<string, unknown>[] = [];
  const subject = `Review requested: ${args.serviceNumber ?? "service"}`;
  const sectionList = sectionLineItems(args.sections, args.profilesById);
  const link = reviewLink(args.serviceId, args.requestId);
  for (const reviewer of args.reviewers) {
    if (!reviewer.email) continue;
    const inner = `
      <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">
        Dear ${escapeHtml(reviewer.full_name ?? "")},
      </p>
      <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
        <strong>${escapeHtml(args.requesterName)}</strong> has asked you to review their work on
        service <strong>${escapeHtml(args.serviceNumber ?? args.serviceId)}</strong>.
      </p>
      <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin-top: 16px;">
        <strong>Sections to review:</strong>
      </p>
      <ul style="color: #4a5568; font-size: 14px; line-height: 1.6; padding-left: 20px;">${sectionList}</ul>
      <p style="color: #4a5568; font-size: 14px; line-height: 1.6; border-left: 3px solid #e2e8f0; padding-left: 12px; margin-top: 16px;">
        <strong>Note:</strong> ${escapeHtml(args.note)}
      </p>
      ${ctaButton(link, "Open the service")}
      <p style="color: #a0aec0; font-size: 12px; margin-top: 24px;">
        Any reviewer marking this request as reviewed closes it for everyone.
      </p>
    `;
    const html = envelope(inner, args.brand);
    const { data: sendData, error: sendError } = await resend.emails.send({
      from: fromHeader(args.brand),
      to: reviewer.email,
      subject,
      html,
    });
    const commRow = await logCommunication({
      serviceId: args.serviceId,
      tenantId: args.tenantId,
      sentBy: args.requesterId,
      sentByName: args.requesterName,
      sentToEmail: reviewer.email,
      sentToProfileId: null,
      emailType: "review_request_created",
      subject,
      bodyHtml: html,
      relatedEntityType: "service",
      relatedEntityId: args.serviceId,
      resendMessageId: sendData?.id ?? null,
      status: sendError ? "failed" : "sent",
    });
    if (commRow) commRows.push(commRow);
  }
  return commRows;
}

interface SendClosedByReviewerArgs {
  supabase: SupabaseClient;
  tenantId: string;
  brand: TenantBrand;
  serviceId: string;
  serviceNumber: string | null;
  requestId: string;
  reviewerId: string;
  reviewerName: string;
  requesterEmail: string | null;
  requesterName: string;
}

export async function sendReviewRequestClosedByReviewerEmail(
  args: SendClosedByReviewerArgs,
): Promise<Record<string, unknown> | null> {
  if (!args.requesterEmail) return null;
  const subject = `${args.reviewerName} reviewed your request on ${args.serviceNumber ?? "service"}`;
  const link = reviewLink(args.serviceId, args.requestId);
  const inner = `
    <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">
      Dear ${escapeHtml(args.requesterName)},
    </p>
    <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
      <strong>${escapeHtml(args.reviewerName)}</strong> marked your review request on
      service <strong>${escapeHtml(args.serviceNumber ?? args.serviceId)}</strong> as reviewed.
      The request is now closed.
    </p>
    ${ctaButton(link, "Open the service")}
  `;
  const html = envelope(inner, args.brand);
  const { data: sendData, error: sendError } = await resend.emails.send({
    from: fromHeader(args.brand),
    to: args.requesterEmail,
    subject,
    html,
  });
  return await logCommunication({
    serviceId: args.serviceId,
    tenantId: args.tenantId,
    sentBy: args.reviewerId,
    sentByName: args.reviewerName,
    sentToEmail: args.requesterEmail,
    sentToProfileId: null,
    emailType: "review_request_closed_by_reviewer",
    subject,
    bodyHtml: html,
    relatedEntityType: "service",
    relatedEntityId: args.serviceId,
    resendMessageId: sendData?.id ?? null,
    status: sendError ? "failed" : "sent",
  });
}

interface SendClosedByRequesterArgs {
  supabase: SupabaseClient;
  tenantId: string;
  brand: TenantBrand;
  serviceId: string;
  serviceNumber: string | null;
  requestId: string;
  requesterId: string;
  requesterName: string;
  reviewers: Array<{ admin_id: string; full_name: string | null; email: string | null }>;
}

export async function sendReviewRequestClosedByRequesterEmails(
  args: SendClosedByRequesterArgs,
): Promise<Record<string, unknown>[]> {
  const commRows: Record<string, unknown>[] = [];
  const subject = `Review request closed on ${args.serviceNumber ?? "service"}`;
  const link = reviewLink(args.serviceId, args.requestId);
  for (const reviewer of args.reviewers) {
    if (!reviewer.email) continue;
    const inner = `
      <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">
        Dear ${escapeHtml(reviewer.full_name ?? "")},
      </p>
      <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
        <strong>${escapeHtml(args.requesterName)}</strong> closed the review request on
        service <strong>${escapeHtml(args.serviceNumber ?? args.serviceId)}</strong>. No further
        action is needed from you.
      </p>
      ${ctaButton(link, "Open the service")}
    `;
    const html = envelope(inner, args.brand);
    const { data: sendData, error: sendError } = await resend.emails.send({
      from: fromHeader(args.brand),
      to: reviewer.email,
      subject,
      html,
    });
    const commRow = await logCommunication({
      serviceId: args.serviceId,
      tenantId: args.tenantId,
      sentBy: args.requesterId,
      sentByName: args.requesterName,
      sentToEmail: reviewer.email,
      sentToProfileId: null,
      emailType: "review_request_closed_by_requester",
      subject,
      bodyHtml: html,
      relatedEntityType: "service",
      relatedEntityId: args.serviceId,
      resendMessageId: sendData?.id ?? null,
      status: sendError ? "failed" : "sent",
    });
    if (commRow) commRows.push(commRow);
  }
  return commRows;
}
