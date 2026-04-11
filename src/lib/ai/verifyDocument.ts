import Anthropic from "@anthropic-ai/sdk";
import type { VerificationRules, VerificationResult, RuleResult } from "@/types";
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

interface VerifyParams {
  fileBuffer: Buffer;
  mimeType: string;
  rules: VerificationRules;
  applicationContext: {
    contact_name: string | null;
    business_name: string | null;
    ubo_data: unknown;
  };
  /** Optional document type used to filter relevant knowledge base entries */
  documentType?: string | null;
  /** Plain English rules typed by admin in Settings > Verification Rules */
  plainTextRules?: string | null;
}

/**
 * Load active knowledge base entries relevant to this verification.
 * Pulls all rules and document_requirements + any regulatory_text where
 * applies_to.document_type matches (or is unset). Fails open — if the
 * table doesn't exist yet or the query fails, returns an empty list so
 * verification still proceeds.
 */
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

    // Filter: include if applies_to.document_type matches OR is unset
    const relevant = entries.filter((e) => {
      const appliesDocType = (e.applies_to?.document_type as string) ?? null;
      if (!appliesDocType) return true; // applies to everything
      if (!documentType) return true; // no doc type to filter by
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

export async function verifyDocument({
  fileBuffer,
  mimeType,
  rules,
  applicationContext,
  documentType,
  plainTextRules,
}: VerifyParams): Promise<VerificationResult> {
  const base64 = fileBuffer.toString("base64");
  const isImage = mimeType.startsWith("image/");

  // Load applicable knowledge base entries (fails open if table missing)
  const knowledgeBase = await loadRelevantKnowledgeBase(
    documentType ?? rules.document_type_expected ?? null
  );

  const systemPrompt = `You are a compliance document verification assistant for Mauritius Offshore Client Portal, a licensed management company in Mauritius. Your job is to analyze uploaded documents and verify they meet KYC/AML requirements.

You will receive:
1. A document image or PDF
2. The expected document type
3. Fields to extract
4. Application context (applicant name, company name)
5. Verification rules written in plain English by the compliance team (when provided)
6. Relevant compliance knowledge base entries (rules, document requirements, and regulatory text from the Mauritius FSC and related authorities)

When plain English verification rules are provided, apply EACH numbered rule to the document. For each rule, determine whether it PASSES or FAILS with a brief explanation and specific evidence from the document. If no numbered rules are provided, fall back to basic document verification (readability, document type match, field extraction).

When evaluating the document, reference the knowledge base entries to determine whether the document satisfies the cited rules and regulatory requirements. Cite the entries by their TITLE in your reasoning when relevant.

Respond ONLY in valid JSON. No preamble. No markdown. Exact schema required.`;

  const rulesSection = plainTextRules
    ? `Verification rules (apply each one):\n${plainTextRules}`
    : rules.match_rules.length > 0
      ? `Matching rules (structured):\n${JSON.stringify(rules.match_rules, null, 2)}`
      : "No specific rules — perform basic verification (readability, document type match, field extraction)";

  const userPrompt = `Verify this document.

Expected document type: ${rules.document_type_expected || "any"}
Fields to extract: ${JSON.stringify(rules.extract_fields)}

Application context:
- Applicant name: ${applicationContext.contact_name || "not provided"}
- Company name: ${applicationContext.business_name || "not provided"}
- UBOs: ${JSON.stringify(applicationContext.ubo_data)}

${rulesSection}
${
  knowledgeBase
    ? `\nRelevant compliance knowledge base:\n${knowledgeBase}\n`
    : ""
}
Respond with this exact JSON schema:
{
  "can_read_document": boolean,
  "document_type_detected": string,
  "extracted_fields": { "field_name": "extracted_value" },
  "match_results": [
    {
      "field": string,
      "expected": string,
      "found": string,
      "passed": boolean,
      "note": string
    }
  ],
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
- rule_results: populate only when numbered plain English rules were provided; one entry per rule
- overall_status: "verified" if ALL rules pass, "flagged" if ANY rule fails, "manual_review" if document cannot be read
- If you cannot read the document clearly, set can_read_document: false and overall_status: "manual_review"
- If using structured match_rules (not plain text), keep rule_results as an empty array`;

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
        content: [
          contentBlock,
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  let text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip markdown code fences if the AI wrapped the JSON in ```json ... ```
  text = text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(text) as VerificationResult;
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
}
