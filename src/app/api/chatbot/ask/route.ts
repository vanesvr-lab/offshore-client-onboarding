import { NextResponse } from "next/server";
import {
  searchKnowledgeBase,
  loadCandidatesByAudience,
  type Audience,
} from "@/lib/chatbot/search";
import { answerWithLlm } from "@/lib/chatbot/llmFallback";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { getTenantBrand } from "@/lib/tenant-brand";

// B-128 — Chatbot search endpoint. Public (no auth) because the client
// widget calls it from the unauthenticated `ClientShell`; audience
// filtering happens server-side so a client request can't surface
// admin-only content even if the body claimed otherwise.

const MAX_QUESTION_LENGTH = 500;

interface AskBody {
  question?: string;
  audience?: string;
}

interface KeywordResponse {
  mode: "keyword";
  matches: Array<{
    id: string;
    title: string;
    category: string;
    content: string;
    rank: number;
  }>;
}

interface LlmResponse {
  mode: "llm";
  answer: string;
  candidates: Array<{ id: string; title: string; category: string }>;
}

interface ErrorResponse {
  mode: "error";
  message: string;
}

export async function POST(request: Request) {
  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json(
      { mode: "error", message: "Invalid JSON body." } as ErrorResponse,
      { status: 400 },
    );
  }

  const question = (body.question ?? "").trim();
  const audienceRaw = (body.audience ?? "").trim();

  if (!question) {
    return NextResponse.json(
      { mode: "error", message: "Question is required." } as ErrorResponse,
      { status: 400 },
    );
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      {
        mode: "error",
        message: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).`,
      } as ErrorResponse,
      { status: 400 },
    );
  }
  if (audienceRaw !== "admin" && audienceRaw !== "client") {
    return NextResponse.json(
      {
        mode: "error",
        message: "audience must be 'admin' or 'client'.",
      } as ErrorResponse,
      { status: 400 },
    );
  }
  const audience = audienceRaw as Audience;

  try {
    const matches = await searchKnowledgeBase(question, audience, 5);
    if (matches.length >= 1) {
      return NextResponse.json({
        mode: "keyword",
        matches,
      } as KeywordResponse);
    }

    // Zero keyword matches — fall through to the LLM with up to 10
    // audience-relevant entries as context.
    const candidates = await loadCandidatesByAudience(audience, 10);
    if (candidates.length === 0) {
      return NextResponse.json({
        mode: "llm",
        answer:
          "I don't have any knowledge entries to draw from yet — please ask your account manager.",
        candidates: [],
      } as LlmResponse);
    }

    // B-129 — resolve tenant brand so the LLM system prompt names the
    // current portal instead of a hardcoded "GWMS" reference. Route is
    // public, so we read the default tenant via the admin client.
    const brand = await getTenantBrand(createAdminClient(), DEFAULT_TENANT_ID);
    const llm = await answerWithLlm(question, candidates, brand.portal_name);
    return NextResponse.json({
      mode: "llm",
      answer: llm.answer,
      candidates: llm.candidates,
    } as LlmResponse);
  } catch (err: unknown) {
    console.error("[chatbot/ask] failed", err);
    return NextResponse.json(
      {
        mode: "error",
        message:
          "The assistant is unavailable right now — try again in a moment.",
      } as ErrorResponse,
      { status: 200 },
    );
  }
}
