import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { KYC_PREFILLABLE_FIELDS } from "@/lib/constants/prefillFields";
import type { AiExtractionField } from "@/types";

interface PatchBody {
  ai_enabled?: boolean;
  ai_extraction_enabled?: boolean;
  ai_extraction_fields?: AiExtractionField[];
  verification_rules_text?: string | null;
  /** Legacy alias kept for the old camelCase caller. */
  verificationRulesText?: string | null;
}

const PREFILLABLE = new Set<string>(KYC_PREFILLABLE_FIELDS);

function validateExtractionFields(input: unknown): { ok: true; value: AiExtractionField[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "ai_extraction_fields must be an array" };
  const seen = new Set<string>();
  const out: AiExtractionField[] = [];
  for (let i = 0; i < input.length; i++) {
    const f = input[i] as Partial<AiExtractionField> | null;
    if (!f || typeof f !== "object") return { ok: false, error: `ai_extraction_fields[${i}] must be an object` };
    const key = typeof f.key === "string" ? f.key.trim() : "";
    const label = typeof f.label === "string" ? f.label.trim() : "";
    const type = f.type === "date" ? "date" : "string";
    const aiHint = typeof f.ai_hint === "string" && f.ai_hint.trim() ? f.ai_hint.trim() : undefined;
    const prefillRaw = f.prefill_field ?? null;
    if (!key) return { ok: false, error: `ai_extraction_fields[${i}].key is required` };
    if (!label) return { ok: false, error: `ai_extraction_fields[${i}].label is required` };
    if (seen.has(key)) return { ok: false, error: `Duplicate field key "${key}"` };
    seen.add(key);
    let prefill: string | null = null;
    if (prefillRaw !== null && prefillRaw !== undefined && prefillRaw !== "") {
      if (typeof prefillRaw !== "string") return { ok: false, error: `ai_extraction_fields[${i}].prefill_field must be a string or null` };
      if (!PREFILLABLE.has(prefillRaw)) {
        return { ok: false, error: `prefill_field "${prefillRaw}" is not in the allowed KYC prefill list` };
      }
      prefill = prefillRaw;
    }
    out.push({ key, label, ai_hint: aiHint, type, prefill_field: prefill });
  }
  return { ok: true, value: out };
}

export async function PATCH(
  request: Request,
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

  const body = (await request.json()) as PatchBody;
  const update: Record<string, unknown> = {};

  if (typeof body.ai_enabled === "boolean") update.ai_enabled = body.ai_enabled;
  if (typeof body.ai_extraction_enabled === "boolean") update.ai_extraction_enabled = body.ai_extraction_enabled;

  if (body.ai_extraction_fields !== undefined) {
    const v = validateExtractionFields(body.ai_extraction_fields);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    update.ai_extraction_fields = v.value;
  }

  // Accept either snake_case (new) or camelCase (legacy) for the rules text field.
  if (body.verification_rules_text !== undefined) {
    update.verification_rules_text = body.verification_rules_text ?? null;
  } else if (body.verificationRulesText !== undefined) {
    update.verification_rules_text = body.verificationRulesText ?? null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("document_types")
    .update(update)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/settings/rules");

  return NextResponse.json({ success: true });
}
