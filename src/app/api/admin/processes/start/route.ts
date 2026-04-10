import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientId, processTemplateId, notes } = await request.json() as {
    clientId: string;
    processTemplateId: string;
    notes?: string;
  };

  if (!clientId || !processTemplateId) {
    return NextResponse.json({ error: "clientId and processTemplateId are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Create client_processes row
  const { data: process, error: processError } = await supabase
    .from("client_processes")
    .insert({
      client_id: clientId,
      process_template_id: processTemplateId,
      status: "collecting",
      notes: notes ?? null,
      started_by: session.user.id,
    })
    .select()
    .single();

  if (processError) return NextResponse.json({ error: processError.message }, { status: 500 });

  // Fetch requirements for the template
  const { data: requirements } = await supabase
    .from("process_requirements")
    .select("*, document_types(id, name, category)")
    .eq("process_template_id", processTemplateId)
    .order("sort_order");

  if (!requirements?.length) {
    revalidatePath(`/admin/clients/${clientId}`);
    return NextResponse.json({ process, available: 0, total: 0 });
  }

  // Fetch existing documents for this client
  const { data: existingDocs } = await supabase
    .from("documents")
    .select("id, document_type_id, kyc_record_id")
    .eq("client_id", clientId)
    .eq("is_active", true);

  const docByTypeId: Record<string, string> = {};
  for (const doc of existingDocs ?? []) {
    docByTypeId[doc.document_type_id] = doc.id;
  }

  // Build process_documents rows
  const processDocRows: Record<string, unknown>[] = [];
  let availableCount = 0;

  for (const req of requirements) {
    const existingDocId = docByTypeId[req.document_type_id] ?? null;
    const available = existingDocId !== null;

    processDocRows.push({
      process_id: process.id,
      requirement_id: req.id,
      kyc_record_id: null,
      document_id: existingDocId,
      source: available ? "kyc_reused" : null,
      status: available ? "available" : "missing",
      received_at: available ? new Date().toISOString() : null,
    });

    if (available) availableCount++;
  }

  const { error: pdError } = await supabase.from("process_documents").insert(processDocRows);
  if (pdError) return NextResponse.json({ error: pdError.message }, { status: 500 });

  // Create document_links for all auto-linked documents
  const links = processDocRows
    .filter((row) => row.document_id)
    .map((row) => ({
      document_id: row.document_id as string,
      linked_to_type: "process",
      linked_to_id: process.id,
      required_by: row.requirement_id as string,
      linked_by: session.user.id,
    }));

  if (links.length > 0) {
    await supabase.from("document_links").insert(links);
  }

  revalidatePath(`/admin/clients/${clientId}`);
  return NextResponse.json({
    process,
    available: availableCount,
    total: requirements.length,
  });
}
