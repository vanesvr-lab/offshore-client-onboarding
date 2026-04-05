import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import type { VerificationRules } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { documentUploadId, applicationId, requirementId } =
      await request.json();

    // Verify the user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // Fetch document upload record
    const { data: upload, error: uploadError } = await adminSupabase
      .from("document_uploads")
      .select("*")
      .eq("id", documentUploadId)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json(
        { error: "Document upload not found" },
        { status: 404 }
      );
    }

    // Fetch verification rules
    const { data: requirement } = await adminSupabase
      .from("document_requirements")
      .select("verification_rules")
      .eq("id", requirementId)
      .single();

    // Fetch application context
    const { data: application } = await adminSupabase
      .from("applications")
      .select("contact_name, business_name, ubo_data")
      .eq("id", applicationId)
      .single();

    // Download file from Supabase Storage
    const { data: fileData, error: storageError } = await adminSupabase.storage
      .from("documents")
      .download(upload.file_path!);

    if (storageError || !fileData) {
      return NextResponse.json(
        { error: "Failed to download document from storage" },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const rules = (requirement?.verification_rules || {
      extract_fields: [],
      match_rules: [],
    }) as VerificationRules;

    // Run AI verification
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

    // Map to verification_status field
    const verificationStatus =
      result.can_read_document === false
        ? "manual_review"
        : result.overall_status;

    // Update document_uploads record
    await adminSupabase
      .from("document_uploads")
      .update({
        verification_status: verificationStatus,
        verification_result: result,
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentUploadId);

    return NextResponse.json({ result, verificationStatus });
  } catch (err: unknown) {
    console.error("Verification error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Verification failed",
      },
      { status: 500 }
    );
  }
}
