import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import type { VerificationRules } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { documentUploadId, applicationId, requirementId } = await request.json();

    const supabase = createAdminClient();

    const { data: upload, error: uploadError } = await supabase
      .from("document_uploads")
      .select("*")
      .eq("id", documentUploadId)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json({ error: "Document upload not found" }, { status: 404 });
    }

    const [{ data: requirement }, { data: application }] = await Promise.all([
      supabase.from("document_requirements").select("verification_rules").eq("id", requirementId).single(),
      supabase.from("applications").select("contact_name, business_name, ubo_data").eq("id", applicationId).single(),
    ]);

    const { data: fileData, error: storageError } = await supabase.storage
      .from("documents")
      .download(upload.file_path!);

    if (storageError || !fileData) {
      return NextResponse.json({ error: "Failed to download document from storage" }, { status: 500 });
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const rules = (requirement?.verification_rules || { extract_fields: [], match_rules: [] }) as VerificationRules;

    const result = await verifyDocument({
      fileBuffer,
      mimeType: upload.mime_type || "application/pdf",
      rules,
      applicationContext: {
        contact_name: application?.contact_name || null,
        business_name: application?.business_name || null,
        ubo_data: application?.ubo_data || null,
      },
    });

    const verificationStatus =
      result.can_read_document === false ? "manual_review" : result.overall_status;

    await supabase
      .from("document_uploads")
      .update({
        verification_status: verificationStatus,
        verification_result: result,
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentUploadId);

    return NextResponse.json({ result, verificationStatus });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
