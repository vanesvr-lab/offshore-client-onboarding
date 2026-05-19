import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { SignJWT } from "jose";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

// B-127 — Invite a new admin. Body: { name, email, role_slug }.
// Creates a users + profiles row (with password_hash = null) when the
// email doesn't exist on the tenant; inserts admin_users; mints a 24h
// JWT with purpose=admin_invite and emails a magic link to
// /auth/set-password. Reuses the JWT pattern from
// /api/admin/clients/[id]/send-invite — the set-password POST already
// accepts the admin_invite purpose (added in B-127).

const resend = new Resend(process.env.RESEND_API_KEY!);

interface Body {
  name?: string;
  email?: string;
  role_slug?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.adminPermissions?.admin_mgmt_access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const roleSlug = (body.role_slug ?? "").trim();

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!roleSlug) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Resolve role
  const { data: role, error: roleErr } = await supabase
    .from("admin_roles")
    .select("id, slug, name")
    .eq("tenant_id", tenantId)
    .eq("slug", roleSlug)
    .maybeSingle();
  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  // Lookup-or-create the users row keyed on (tenant_id, email).
  let userId: string;
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();

  if (existingUser?.id) {
    userId = existingUser.id;
  } else {
    const { data: insertedUser, error: insertErr } = await supabase
      .from("users")
      .insert({
        tenant_id: tenantId,
        email,
        full_name: name,
        password_hash: null,
        role: "admin",
        is_active: true,
      })
      .select("id")
      .single();
    if (insertErr || !insertedUser) {
      return NextResponse.json(
        { error: insertErr?.message ?? "Failed to create user" },
        { status: 500 },
      );
    }
    userId = insertedUser.id;

    // Mirror into the legacy `profiles` table so the auth fallback path
    // (and any code that still reads profiles.full_name) sees the new
    // admin. The set-password POST already dual-writes the password hash
    // when the recipient sets their password.
    await supabase.from("profiles").insert({
      id: userId,
      tenant_id: tenantId,
      email,
      full_name: name,
      password_hash: null,
      is_deleted: false,
    });
  }

  // Reject if already in admin_users — prevents duplicate-role assignment
  const { data: existingAdmin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingAdmin?.id) {
    return NextResponse.json(
      { error: "This person is already an admin." },
      { status: 400 },
    );
  }

  const { data: adminUser, error: adminErr } = await supabase
    .from("admin_users")
    .insert({ user_id: userId, role_id: role.id })
    .select("id, user_id, role_id")
    .single();
  if (adminErr || !adminUser) {
    return NextResponse.json(
      { error: adminErr?.message ?? "Failed to grant admin access" },
      { status: 500 },
    );
  }

  // Mint magic-link JWT (24h, purpose=admin_invite)
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({ sub: userId, email, purpose: "admin_invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/auth/set-password?token=${encodeURIComponent(token)}`;

  const subject = "You've been invited to the GWMS admin portal";
  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Mauritius Offshore Admin Portal</h1>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Hi ${name},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            You've been invited to join the GWMS admin portal as <strong>${role.name}</strong>.
            Click the button below to set your password and sign in.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}"
               style="background: #1a365d; color: white; padding: 14px 32px; border-radius: 6px;
                      text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Set up my account
            </a>
          </div>
          <p style="color: #718096; font-size: 13px;">
            This link expires in 24 hours.
          </p>
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          Mauritius Offshore Admin Portal
        </div>
      </div>
    `;

  const { error: emailErr } = await resend.emails.send({
    from: `Mauritius Offshore Admin Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to: email,
    subject,
    html,
  });
  if (emailErr) {
    return NextResponse.json(
      { error: `Failed to send invite email: ${emailErr.message}` },
      { status: 500 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "admin_invited",
    entity_type: "admin_user",
    entity_id: userId,
    previous_value: null,
    new_value: { role_slug: role.slug, email, name },
  });

  revalidatePath("/admin/settings/admins");
  return NextResponse.json({
    id: adminUser.id,
    user_id: userId,
    role_id: role.id,
    name,
    email,
    role_slug: role.slug,
    role_name: role.name,
    invite_sent: true,
  });
}
