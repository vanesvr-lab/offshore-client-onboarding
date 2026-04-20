import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import type { AiExtractionField, VerificationRules } from "@/types";

/**
 * B-033 — Admin "Re-run AI" on a document.
 * POST /api/admin/documents/[id]/rerun-ai
 *
 * Downloads the file, re-runs the Claude verification with the current
 * document-type config, overwrites verification_status/result/verified_at,
 * and resets prefill_dismissed_at so the client-side banner can re-appear.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load document + joined type config
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select(
      "id, file_path, mime_type, file_name, document_type_id, document_types(name, ai_verification_rules, verification_rules_text, ai_enabled, ai_extraction_enabled, ai_extraction_fields)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  type DocTypeJoin = {
    name: string;
    ai_verification_rules: Record<string, unknown> | null;
    verification_rules_text: string | null;
    ai_enabled: boolean | null;
    ai_extraction_enabled: boolean | null;
    ai_extraction_fields: unknown;
  };
  const docTypeRaw = (doc as unknown as { document_types: DocTypeJoin | DocTypeJoin[] | null }).document_types;
  const docType: DocTypeJoin | null = Array.isArray(docTypeRaw) ? (docTypeRaw[0] ?? null) : docTypeRaw;

  if (!docType) {
    return NextResponse.json({ error: "Document type not found for this document" }, { status: 404 });
  }

  if (docType.ai_enabled === false) {
    return NextResponse.json(
      { error: "AI is disabled on this document type. Enable it in Settings → AI Document Rules first." },
      { status: 400 }
    );
  }

  // Mark pending + reset prefill dismissal up-front so UI reflects the re-run.
  await supabase
    .from("documents")
    .update({
      verification_status: "pending",
      verification_result: null,
      verified_at: null,
      prefill_dismissed_at: null,
    })
    .eq("id", params.id);

  // Download file from storage
  const { data: fileBlob, error: dlError } = await supabase.storage
    .from("documents")
    .download((doc as { file_path: string }).file_path);
  if (dlError || !fileBlob) {
    await supabase
      .from("documents")
      .update({ verification_status: "manual_review" })
      .eq("id", params.id);
    return NextResponse.json({ error: dlError?.message ?? "Could not download file" }, { status: 500 });
  }
  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

  const rules: VerificationRules = (docType.ai_verification_rules as VerificationRules | null) ?? {
    extract_fields: [],
    match_rules: [],
  };
  const extractionFields = Array.isArray(docType.ai_extraction_fields)
    ? (docType.ai_extraction_fields as AiExtractionField[])
    : [];

  try {
    const result = await verifyDocument({
      fileBuffer,
      mimeType: (doc as { mime_type: string | null }).mime_type ?? "application/pdf",
      rules,
      applicationContext: { contact_name: null, business_name: null, ubo_data: null },
      documentType: docType.name,
      plainTextRules: docType.verification_rules_text ?? null,
      extractionEnabled: docType.ai_extraction_enabled === true,
      aiExtractionFields: extractionFields,
    });

    const verificationStatus =
      result.can_read_document === false ? "manual_review" : result.overall_status;

    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update({
        verification_status: verificationStatus,
        verification_result: result as unknown as Record<string, unknown>,
        verified_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select(
        "id, verification_status, verification_result, verified_at, prefill_dismissed_at, admin_status"
      )
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    // Audit log — best-effort
    await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      action: "document_ai_rerun",
      entity_type: "document",
      entity_id: params.id,
      detail: { overall_status: verificationStatus, file_name: (doc as { file_name: string }).file_name },
    });

    return NextResponse.json({ document: updated });
  } catch (err: unknown) {
    await supabase
      .from("documents")
      .update({
        verification_status: "manual_review",
        verified_at: new Date().toISOString(),
      })
      .eq("id", params.id);
    const message = err instanceof Error ? err.message : "AI re-run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
