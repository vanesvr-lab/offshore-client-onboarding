import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RULES: { name: string; text: string }[] = [
  {
    name: "Certified Passport Copy",
    text: `1. Check passport expiry date is not expired
2. Check name on passport matches the client name provided
3. Document must be a certified copy (look for certification stamp, notary signature, or attestation)
4. Photo page must be clearly readable with no obstructions
5. Extract passport number, nationality, and date of birth`,
  },
  {
    name: "Proof of Residential Address",
    text: `1. Document must be dated within the last 3 months
2. Name on document must match client name
3. Full residential address must be visible
4. Document must be a utility bill, bank statement, or government correspondence
5. PO Box addresses are not acceptable`,
  },
  {
    name: "Certificate of Incorporation",
    text: `1. Company name must match the business name in the application
2. Document must be a certified copy
3. Extract company registration number, date of incorporation, and jurisdiction
4. Document must be from a recognized registrar of companies`,
  },
  {
    name: "Bank Reference Letter",
    text: `1. Letter must be on official bank letterhead
2. Must confirm the individual or entity is a customer in good standing
3. Must be signed by an authorized bank official
4. Name must match client name
5. Must be dated within the last 3 months`,
  },
  {
    name: "Certificate of Good Standing",
    text: `1. Company name must match the application
2. Must be issued within the last 6 months
3. Must be a certified copy
4. Must be from the registrar of companies in the country of incorporation`,
  },
  {
    name: "Curriculum Vitae / Resume",
    text: `1. Name must match the client name
2. Must show professional qualifications and business background
3. Must include employment history`,
  },
  {
    name: "Declaration of Source of Funds",
    text: `1. Must be signed by the declarant
2. Name must match client name
3. Must clearly explain the origin of funds
4. Must include a date`,
  },
  {
    name: "PEP Declaration Form",
    text: `1. Must be signed by the declarant
2. Name must match client name
3. All required fields must be completed
4. PEP status must be clearly indicated (yes or no)`,
  },
  {
    name: "Register of Directors",
    text: `1. Company name must match the application
2. Must show all currently appointed directors
3. Must include full names and dates of appointment`,
  },
  {
    name: "Register of Shareholders/Members",
    text: `1. Company name must match the application
2. Must show all shareholders with ownership percentages
3. Total shareholding must equal 100 percent`,
  },
];

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const results: { name: string; updated: boolean }[] = [];

  for (const rule of RULES) {
    const { error } = await supabase
      .from("document_types")
      .update({ verification_rules_text: rule.text })
      .ilike("name", rule.name);

    results.push({ name: rule.name, updated: !error });
  }

  return NextResponse.json({ success: true, results });
}
