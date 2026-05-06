import Anthropic from "@anthropic-ai/sdk";
import type {
  AiExtractionField,
  RuleResult,
  VerificationResult,
  VerificationRules,
} from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Lazy-instantiate the Anthropic client to avoid module-load-time env issues
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in the environment");
    }
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

/**
 * B-049 §3.4 — Verification context schema.
 *
 * Anything a verification rule might want to compare the document against
 * lives here. Person-level docs (passport, POA, CV, source-of-funds
 * evidence, etc.) build this from `client_profile_kyc` for the active
 * profile. Application-level docs build it from `services` + the primary
 * client profile.
 *
 * Add new keys as new rules need them — keep them all string-or-null so the
 * prompt rendering is trivial.
 */
export interface VerificationContext {
  // Application-wide
  contact_name: string | null;
  business_name: string | null;
  ubo_data: unknown;
  // Per-person identity
  applicant_full_name?: string | null;
  applicant_dob?: string | null;
  applicant_nationality?: string | null;
  applicant_passport_number?: string | null;
  applicant_residential_address?: string | null;
  // Per-person professional
  declared_occupation?: string | null;
  declared_employer?: string | null;
  declared_years_in_role?: number | null;
  declared_years_total_experience?: number | null;
  declared_industry?: string | null;
  // Per-person financial declarations
  declared_source_of_funds?: string | null;
  declared_source_of_funds_other?: string | null;
  declared_source_of_wealth?: string | null;
}

interface VerifyParams {
  fileBuffer: Buffer;
  mimeType: string;
  rules: VerificationRules;
  applicationContext: VerificationContext;
  /** Optional document type used to filter relevant knowledge base entries */
  documentType?: string | null;
  /** Plain English rules typed by admin in Settings > Verification Rules */
  plainTextRules?: string | null;
  /** B-033 — when true, the prompt asks the model to populate extracted_fields. */
  extractionEnabled?: boolean;
  /** B-033 — extraction schema per document type (key/label/hint/type). */
  aiExtractionFields?: AiExtractionField[];
}

async function loadRelevantKnowledgeBase(
  documentType: string | null
): Promise<string> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("title, category, content, source, applies_to")
      .eq("is_active", true);

    if (error || !data || data.length === 0) return "";

    type Entry = {
      title: string;
      category: string;
      content: string;
      source: string | null;
      applies_to: Record<string, unknown> | null;
    };

    const entries = data as Entry[];
    const relevant = entries.filter((e) => {
      const appliesDocType = (e.applies_to?.document_type as string) ?? null;
      if (!appliesDocType) return true;
      if (!documentType) return true;
      return appliesDocType.toLowerCase() === documentType.toLowerCase();
    });
    if (relevant.length === 0) return "";
    return relevant
      .map((e) => {
        const src = e.source ? ` (Source: ${e.source})` : "";
        return `[${e.category.toUpperCase()}] ${e.title}${src}\n${e.content}`;
      })
      .join("\n\n---\n\n");
  } catch {
    return "";
  }
}

/**
 * Best-effort ISO-date normalization. Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, D MMM YYYY, etc.
 * Returns ISO `YYYY-MM-DD` on success, null if unparseable.
 */
function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dmY = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;
  const m = trimmed.match(dmY);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = yRaw.length === 2 ? (Number(yRaw) > 50 ? `19${yRaw}` : `20${yRaw}`) : yRaw;
    const dn = Number(d);
    const mn = Number(mo);
    if (dn >= 1 && dn <= 31 && mn >= 1 && mn <= 12) {
      return `${y.padStart(4, "0")}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const mo = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

export async function verifyDocument({
  fileBuffer,
  mimeType,
  rules,
  applicationContext,
  documentType,
  plainTextRules,
  extractionEnabled,
  aiExtractionFields,
}: VerifyParams): Promise<VerificationResult> {
  const base64 = fileBuffer.toString("base64");
  const isImage = mimeType.startsWith("image/");
  const doExtract = Boolean(extractionEnabled && aiExtractionFields && aiExtractionFields.length > 0);

  const knowledgeBase = await loadRelevantKnowledgeBase(
    documentType ?? rules.document_type_expected ?? null
  );

  const systemPrompt = `You are a compliance document verification assistant for a licensed management company in Mauritius. Your job is to analyze uploaded documents and verify they meet KYC/AML requirements.

You will receive:
1. A document image or PDF
2. The expected document type
3. Either a list of fields to extract (with hints + types) OR an instruction to not extract
4. Application context (applicant name, company name)
5. Verification rules written in plain English by the compliance team
6. Relevant compliance knowledge base entries

Apply EACH numbered verification rule independently. For each rule decide PASS/FAIL with a brief explanation and specific evidence from the document.

overall_status is derived ONLY from rule_results:
  - all rules pass → "verified"
  - any rule fails → "flagged"
  - document is unreadable → "manual_review" (and set can_read_document: false)

Extraction failures (missing, ambiguous, unparseable fields) MUST NOT change overall_status. If a field cannot be extracted, leave it out of extracted_fields and add a short note to "flags" instead.

Respond ONLY in valid JSON. No preamble. No markdown. Exact schema required.`;

  const rulesSection = plainTextRules
    ? `Verification rules (apply each one):\n${plainTextRules}`
    : rules.match_rules.length > 0
      ? `Matching rules (structured):\n${JSON.stringify(rules.match_rules, null, 2)}`
      : "No specific rules — perform basic verification (readability, document type match).";

  const extractionSection = doExtract
    ? `Extract the following fields. For each, obey the type hint. Return an empty string only if truly not visible.\n${
        (aiExtractionFields ?? [])
          .map(
            (f, i) =>
              `  ${i + 1}. key="${f.key}" label="${f.label}" type=${f.type}${
                f.ai_hint ? ` hint="${f.ai_hint}"` : ""
              }`
          )
          .join("\n")
      }\nReturn extracted_fields as a flat object keyed by the field "key" values.\nFor date-typed fields, return them in ISO format (YYYY-MM-DD) if possible.`
    : `Do not extract any fields. Set extracted_fields to {}.`;

  // B-049 §3.4 — Render any context field that's set so verification rules
  // can compare against them. Order is stable so prompt-cache stays warm.
  const ctx = applicationContext;
  const contextLines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    contextLines.push(`- ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  };
  // B-067 §7.1 — inject today's date FIRST so date-based rules (e.g.
  // "issued within the last 3 months", "must not be future-dated") can compare
  // against an authoritative current date instead of falling back to the
  // model's training cutoff. Stable position keeps the prompt cache warm.
  push("Today's date", new Date().toISOString().slice(0, 10));
  push("Applicant name", ctx.applicant_full_name ?? ctx.contact_name);
  push("Date of birth", ctx.applicant_dob);
  push("Nationality", ctx.applicant_nationality);
  push("Passport number", ctx.applicant_passport_number);
  push("Residential address", ctx.applicant_residential_address);
  push("Declared occupation", ctx.declared_occupation);
  push("Declared employer", ctx.declared_employer);
  push("Years in current role", ctx.declared_years_in_role);
  push("Total years professional experience", ctx.declared_years_total_experience);
  push("Industry", ctx.declared_industry);
  push("Declared source of funds", ctx.declared_source_of_funds);
  if (ctx.declared_source_of_funds === "other") {
    push("Source of funds (free text)", ctx.declared_source_of_funds_other);
  }
  push("Declared source of wealth", ctx.declared_source_of_wealth);
  push("Company name", ctx.business_name);
  if (ctx.ubo_data && (Array.isArray(ctx.ubo_data) ? ctx.ubo_data.length > 0 : true)) {
    push("UBOs", ctx.ubo_data);
  }
  const contextBlock =
    contextLines.length > 0
      ? `Application context:\n${contextLines.join("\n")}`
      : "Application context: not provided";

  const userPrompt = `Verify this document.

Expected document type: ${documentType || rules.document_type_expected || "any"}

${contextBlock}

${rulesSection}

${extractionSection}
${
  knowledgeBase
    ? `\nRelevant compliance knowledge base:\n${knowledgeBase}\n`
    : ""
}
Respond with this exact JSON schema:
{
  "can_read_document": boolean,
  "document_type_detected": string,
  "extracted_fields": { "field_key": "extracted_value" },
  "match_results": [],
  "rule_results": [
    {
      "rule_number": number,
      "rule_text": string,
      "passed": boolean,
      "explanation": string,
      "evidence": string
    }
  ],
  "overall_status": "verified" | "flagged" | "manual_review",
  "confidence_score": number (0-100),
  "flags": [string],
  "reasoning": string
}

Notes:
- rule_results: one entry per numbered rule when rules were provided, else [].
- match_results: always return [] (legacy field; keep empty).
- overall_status depends ONLY on rule_results (see system prompt).`;

  const contentBlock = isImage
    ? ({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: base64,
        },
      } as Anthropic.ImageBlockParam)
    : ({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      } as Anthropic.DocumentBlockParam);

  const response = await getAnthropic().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [contentBlock, { type: "text", text: userPrompt }],
      },
    ],
  });

  let text =
    response.content[0].type === "text" ? response.content[0].text : "";
  text = text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: VerificationResult;
  try {
    parsed = JSON.parse(text) as VerificationResult;
  } catch {
    return {
      can_read_document: false,
      document_type_detected: "unknown",
      extracted_fields: {},
      match_results: [],
      rule_results: [] as RuleResult[],
      overall_status: "manual_review",
      confidence_score: 0,
      flags: ["Failed to parse AI response — queued for manual review"],
      reasoning: text,
    };
  }

  // Normalize date-typed extracted fields; drop unparseable + append a flag.
  if (doExtract && parsed.extracted_fields) {
    const typeByKey = new Map<string, AiExtractionField["type"]>();
    for (const f of aiExtractionFields ?? []) typeByKey.set(f.key, f.type);
    const cleaned: Record<string, string> = {};
    const addFlags: string[] = [];
    for (const [k, v] of Object.entries(parsed.extracted_fields)) {
      if (!v) continue;
      if (typeByKey.get(k) === "date") {
        const iso = normalizeDate(String(v));
        if (iso) cleaned[k] = iso;
        else addFlags.push(`Could not parse date for "${k}" — original: "${v}"`);
      } else {
        cleaned[k] = String(v);
      }
    }
    parsed.extracted_fields = cleaned;
    if (addFlags.length) parsed.flags = [...(parsed.flags ?? []), ...addFlags];
  } else if (!doExtract) {
    parsed.extracted_fields = {};
  }

  // Enforce: overall_status derives from rule_results only.
  if (parsed.can_read_document === false) {
    parsed.overall_status = "manual_review";
  } else if (Array.isArray(parsed.rule_results) && parsed.rule_results.length > 0) {
    const anyFailed = parsed.rule_results.some((r) => !r.passed);
    parsed.overall_status = anyFailed ? "flagged" : "verified";
  }

  // Always return match_results as []; the new contract doesn't use it.
  parsed.match_results = [];

  return parsed;
}
