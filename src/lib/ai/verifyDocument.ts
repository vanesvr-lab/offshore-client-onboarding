import Anthropic from "@anthropic-ai/sdk";
import type { VerificationRules, VerificationResult } from "@/types";
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
4. Matching rules to check
5. Application context (applicant name, company name)
6. Relevant compliance knowledge base entries (rules, document requirements, and regulatory text from the Mauritius FSC and related authorities)

When evaluating the document, reference the knowledge base entries to determine whether the document satisfies the cited rules and regulatory requirements. Cite the entries by their TITLE in your reasoning when relevant.

Respond ONLY in valid JSON. No preamble. No markdown. Exact schema required.`;

  const userPrompt = `Verify this document.

Expected document type: ${rules.document_type_expected || "any"}
Fields to extract: ${JSON.stringify(rules.extract_fields)}

Application context:
- Applicant name: ${applicationContext.contact_name || "not provided"}
- Company name: ${applicationContext.business_name || "not provided"}
- UBOs: ${JSON.stringify(applicationContext.ubo_data)}

Matching rules:
${JSON.stringify(rules.match_rules, null, 2)}
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
  "overall_status": "verified" | "flagged" | "manual_review",
  "confidence_score": number (0-100),
  "flags": [string],
  "reasoning": string
}

If you cannot read the document clearly, set can_read_document: false and overall_status: "manual_review".
If any required match_rule fails, set overall_status: "flagged".
If all required rules pass, set overall_status: "verified".`;

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

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text) as VerificationResult;
  } catch {
    return {
      can_read_document: false,
      document_type_detected: "unknown",
      extracted_fields: {},
      match_results: [],
      overall_status: "manual_review",
      confidence_score: 0,
      flags: ["Failed to parse AI response — queued for manual review"],
      reasoning: text,
    };
  }
}
