import Anthropic from "@anthropic-ai/sdk";
import type { VerificationRules, VerificationResult } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface VerifyParams {
  fileBuffer: Buffer;
  mimeType: string;
  rules: VerificationRules;
  applicationContext: {
    contact_name: string | null;
    business_name: string | null;
    ubo_data: unknown;
  };
}

export async function verifyDocument({
  fileBuffer,
  mimeType,
  rules,
  applicationContext,
}: VerifyParams): Promise<VerificationResult> {
  const base64 = fileBuffer.toString("base64");
  const isImage = mimeType.startsWith("image/");

  const systemPrompt = `You are a compliance document verification assistant for GWMS Ltd, a licensed management company in Mauritius. Your job is to analyze uploaded documents and verify they meet KYC/AML requirements.

You will receive:
1. A document image or PDF
2. The expected document type
3. Fields to extract
4. Matching rules to check
5. Application context (applicant name, company name)

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
      } as Anthropic.RequestDocumentBlock);

  const response = await anthropic.messages.create({
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
