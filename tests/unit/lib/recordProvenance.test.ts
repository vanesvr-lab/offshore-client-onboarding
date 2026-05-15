import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordAiExtractionProvenance } from "@/lib/ai/recordProvenance";
import type { AiExtractionField } from "@/types";

// Minimal supabase mock that records every from()/insert()/update() call
// against an inner buffer so we can assert on the writeback path.
type SupabaseCall = {
  table: string;
  op: "insert" | "update";
  payload?: Record<string, unknown>;
  filter?: Record<string, unknown>;
};

function createMockSupabase() {
  const calls: SupabaseCall[] = [];
  const supabase = {
    from(table: string) {
      const filter: Record<string, unknown> = {};
      const builder = {
        update(payload: Record<string, unknown>) {
          const ret = {
            eq(col: string, value: unknown) {
              filter[col] = value;
              calls.push({ table, op: "update", payload, filter: { ...filter } });
              return Promise.resolve({ data: null, error: null });
            },
            is(col: string, value: unknown) {
              filter[col] = value;
              return ret;
            },
          };
          return ret;
        },
        insert(payload: Record<string, unknown>) {
          calls.push({ table, op: "insert", payload });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
  return { supabase, calls };
}

const passportFields: AiExtractionField[] = [
  { key: "passport_number", label: "Passport number", type: "string", prefill_field: "passport_number" },
  { key: "expiry_date", label: "Expiry date", type: "date", prefill_field: "passport_expiry", is_document_expiry: true },
  { key: "full_name", label: "Full name", type: "string", prefill_field: "full_name" },
];

describe("recordAiExtractionProvenance — doc-expiry writeback", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("writes documents.expiry_date when the OCR field carries is_document_expiry", async () => {
    const { supabase, calls } = createMockSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAiExtractionProvenance({
      supabase: supabase as any,
      tenantId: "t1",
      clientProfileId: "p1",
      sourceDocumentId: "doc1",
      extractedFields: {
        passport_number: "ABC123",
        expiry_date: "2027-05-25",
        full_name: "Jane Doe",
      },
      aiExtractionFields: passportFields,
    });

    const docUpdate = calls.find(
      (c) => c.table === "documents" && c.op === "update",
    );
    expect(docUpdate).toBeDefined();
    expect(docUpdate?.payload).toEqual({ expiry_date: "2027-05-25" });
    expect(docUpdate?.filter).toEqual({ id: "doc1" });
  });

  it("normalizes non-ISO date strings before writing", async () => {
    const { supabase, calls } = createMockSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAiExtractionProvenance({
      supabase: supabase as any,
      tenantId: "t1",
      clientProfileId: "p1",
      sourceDocumentId: "doc1",
      extractedFields: { expiry_date: "05/25/2027" },
      aiExtractionFields: passportFields,
    });

    const docUpdate = calls.find(
      (c) => c.table === "documents" && c.op === "update",
    );
    expect(docUpdate?.payload).toEqual({ expiry_date: "2027-05-25" });
  });

  it("skips the writeback when the value is unparseable as a date", async () => {
    const { supabase, calls } = createMockSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAiExtractionProvenance({
      supabase: supabase as any,
      tenantId: "t1",
      clientProfileId: "p1",
      sourceDocumentId: "doc1",
      extractedFields: { expiry_date: "garbage" },
      aiExtractionFields: passportFields,
    });

    const docUpdate = calls.find(
      (c) => c.table === "documents" && c.op === "update",
    );
    expect(docUpdate).toBeUndefined();
  });

  it("does not write documents.expiry_date for fields without is_document_expiry", async () => {
    const { supabase, calls } = createMockSupabase();
    const fieldsNoFlag: AiExtractionField[] = [
      { key: "expiry_date", label: "Expiry date", type: "date", prefill_field: "passport_expiry" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAiExtractionProvenance({
      supabase: supabase as any,
      tenantId: "t1",
      clientProfileId: "p1",
      sourceDocumentId: "doc1",
      extractedFields: { expiry_date: "2027-05-25" },
      aiExtractionFields: fieldsNoFlag,
    });

    const docUpdate = calls.find(
      (c) => c.table === "documents" && c.op === "update",
    );
    expect(docUpdate).toBeUndefined();
  });
});
