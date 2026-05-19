// B-128 — LLM fallback for the chatbot. Called when keyword search
// returns zero matches. We pass the audience-relevant entries as
// context and ask Claude to answer from them, refusing to invent if
// the answer isn't covered.

import Anthropic from "@anthropic-ai/sdk";
import type { KbEntry } from "./search";

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

function buildSystemPrompt(portalName: string): string {
  return `You are the in-portal assistant for ${portalName}.
Answer the user's question using ONLY the knowledge entries provided in the user message.
If the knowledge entries don't contain the answer, say exactly:
"I don't have that information yet — try asking your account manager."
Do NOT invent procedures, paths, page names, or terms. Do not extrapolate.
Keep answers short (≤4 sentences) unless the user explicitly asks for detail.
Markdown is OK (bold, lists, inline links).`;
}

export interface LlmFallbackResult {
  answer: string;
  candidates: Array<{ id: string; title: string; category: string }>;
}

export async function answerWithLlm(
  question: string,
  candidates: KbEntry[],
  portalName: string,
): Promise<LlmFallbackResult> {
  const anthropic = getAnthropic();

  const knowledge = candidates
    .map((c) => `## ${c.title}\n${c.content}`)
    .join("\n\n---\n\n");

  const userMessage = `Knowledge available:

${knowledge}

---

Question: ${question}`;

  const completion = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 600,
    system: buildSystemPrompt(portalName),
    messages: [{ role: "user", content: userMessage }],
  });

  const block = completion.content[0];
  const answer = block && block.type === "text" ? block.text : "";

  return {
    answer: answer.trim() ||
      "I don't have that information yet — try asking your account manager.",
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
    })),
  };
}
