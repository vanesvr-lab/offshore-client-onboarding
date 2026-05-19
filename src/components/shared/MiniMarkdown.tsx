"use client";

// B-128 — Minimal markdown renderer for the chatbot widget.
// Avoids pulling in react-markdown for the small subset of markdown
// the knowledge_base content actually uses: headers (h1-h4), bold
// (**x**), italic (*x*), inline code (`x`), code fences (```), bullet
// lists (- / *), ordered lists (1.), inline links ([text](url)), and
// blockquotes (>). Anything richer (tables, images, footnotes) falls
// through as plain text.

import React from "react";

interface Props {
  content: string;
  className?: string;
}

// Inline formatter — applied per text line. Order matters: code first
// so its contents aren't reformatted, then links, then bold, then
// italic. We render to a React fragment so each transform produces
// real JSX nodes rather than dangerous HTML.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Split on inline code first.
  const parts: React.ReactNode[] = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let nodeIdx = 0;
  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        ...renderInlineNonCode(text.slice(lastIndex, match.index), `${keyPrefix}-${nodeIdx++}`),
      );
    }
    parts.push(
      <code
        key={`${keyPrefix}-c${nodeIdx++}`}
        className="bg-gray-100 text-brand-navy rounded px-1 py-0.5 text-[0.85em] font-mono"
      >
        {match[1]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(...renderInlineNonCode(text.slice(lastIndex), `${keyPrefix}-${nodeIdx++}`));
  }
  return parts;
}

function renderInlineNonCode(text: string, keyPrefix: string): React.ReactNode[] {
  // Link → bold → italic. Each pass emits a flat array.
  let parts: Array<string | React.ReactNode> = [text];
  // Links [text](url)
  parts = flatMap(parts, (part, i) => {
    if (typeof part !== "string") return [part];
    const rx = /\[([^\]]+)\]\(([^)]+)\)/g;
    const out: Array<string | React.ReactNode> = [];
    let li = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = rx.exec(part)) !== null) {
      if (m.index > li) out.push(part.slice(li, m.index));
      out.push(
        <a
          key={`${keyPrefix}-${i}-l${k++}`}
          href={m[2]}
          className="text-brand-navy underline hover:no-underline"
          target={m[2].startsWith("http") ? "_blank" : undefined}
          rel={m[2].startsWith("http") ? "noopener noreferrer" : undefined}
        >
          {m[1]}
        </a>,
      );
      li = m.index + m[0].length;
    }
    if (li < part.length) out.push(part.slice(li));
    return out;
  });
  // Bold **text**
  parts = flatMap(parts, (part, i) => {
    if (typeof part !== "string") return [part];
    const rx = /\*\*([^*]+)\*\*/g;
    const out: Array<string | React.ReactNode> = [];
    let li = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = rx.exec(part)) !== null) {
      if (m.index > li) out.push(part.slice(li, m.index));
      out.push(
        <strong key={`${keyPrefix}-${i}-b${k++}`} className="font-semibold">
          {m[1]}
        </strong>,
      );
      li = m.index + m[0].length;
    }
    if (li < part.length) out.push(part.slice(li));
    return out;
  });
  // Italic *text* (after bold so ** doesn't get eaten by the single-star pass)
  parts = flatMap(parts, (part, i) => {
    if (typeof part !== "string") return [part];
    const rx = /(?:^|[^*])\*([^*]+)\*(?!\*)/g;
    const out: Array<string | React.ReactNode> = [];
    let li = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = rx.exec(part)) !== null) {
      const fullIdx = m.index + (m[0].startsWith("*") ? 0 : 1);
      if (fullIdx > li) out.push(part.slice(li, fullIdx));
      out.push(
        <em key={`${keyPrefix}-${i}-i${k++}`} className="italic">
          {m[1]}
        </em>,
      );
      li = fullIdx + m[1].length + 2;
    }
    if (li < part.length) out.push(part.slice(li));
    return out;
  });
  return parts as React.ReactNode[];
}

function flatMap<T, U>(arr: T[], fn: (item: T, i: number) => U[]): U[] {
  const out: U[] = [];
  arr.forEach((item, i) => {
    for (const v of fn(item, i)) out.push(v);
  });
  return out;
}

export function MiniMarkdown({ content, className }: Props) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let inFence = false;
  let fenceBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  function flushList(key: string) {
    if (!listBuffer) return;
    const buf = listBuffer;
    if (buf.ordered) {
      blocks.push(
        <ol key={key} className="list-decimal list-outside pl-5 space-y-0.5 my-1">
          {buf.items.map((it, i) => (
            <li key={i}>{renderInline(it, `${key}-${i}`)}</li>
          ))}
        </ol>,
      );
    } else {
      blocks.push(
        <ul key={key} className="list-disc list-outside pl-5 space-y-0.5 my-1">
          {buf.items.map((it, i) => (
            <li key={i}>{renderInline(it, `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
    }
    listBuffer = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inFence) {
        blocks.push(
          <pre
            key={`pre-${i}`}
            className="bg-gray-900 text-gray-100 rounded p-2 my-1 overflow-x-auto text-[0.85em]"
          >
            <code>{fenceBuffer.join("\n")}</code>
          </pre>,
        );
        inFence = false;
        fenceBuffer = [];
      } else {
        flushList(`list-${i}`);
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuffer.push(line);
      continue;
    }

    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headerMatch) {
      flushList(`list-${i}`);
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const cls =
        level === 1
          ? "text-base font-semibold mt-2 mb-1"
          : level === 2
            ? "text-sm font-semibold mt-2 mb-1"
            : "text-xs font-semibold uppercase tracking-wider text-gray-500 mt-2 mb-0.5";
      const Tag = (level === 1 ? "h3" : level === 2 ? "h4" : "h5") as keyof JSX.IntrinsicElements;
      blocks.push(
        <Tag key={`h-${i}`} className={cls}>
          {renderInline(text, `h-${i}`)}
        </Tag>,
      );
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!listBuffer || listBuffer.ordered) {
        flushList(`list-${i}`);
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList(`list-${i}`);
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(olMatch[1]);
      continue;
    }

    if (line.trim() === "") {
      flushList(`list-${i}`);
      continue;
    }

    flushList(`list-${i}`);
    const quoteMatch = line.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      blocks.push(
        <blockquote
          key={`q-${i}`}
          className="border-l-2 border-gray-300 pl-2 italic text-gray-600 my-1"
        >
          {renderInline(quoteMatch[1], `q-${i}`)}
        </blockquote>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="my-1">
        {renderInline(line, `p-${i}`)}
      </p>,
    );
  }
  flushList("list-end");
  if (inFence && fenceBuffer.length > 0) {
    blocks.push(
      <pre
        key="pre-end"
        className="bg-gray-900 text-gray-100 rounded p-2 my-1 overflow-x-auto text-[0.85em]"
      >
        <code>{fenceBuffer.join("\n")}</code>
      </pre>,
    );
  }

  return <div className={className}>{blocks}</div>;
}
