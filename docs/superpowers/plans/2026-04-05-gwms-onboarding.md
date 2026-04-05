# GWMS Client Onboarding Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-portal (client + admin) KYC/AML onboarding web app POC for GWMS Ltd with document upload, AI verification via Claude, and an admin review workflow.

**Architecture:** Next.js 14 App Router with TypeScript, Tailwind CSS, and shadcn/ui. Supabase handles auth (email/password), database (PostgreSQL), and file storage (private bucket). Claude Opus 4.6 performs document OCR and field-matching verification. Resend sends transactional email. No tests required for POC.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Supabase SSR (`@supabase/ssr`), Zustand, react-hook-form + zod, react-dropzone, Anthropic SDK, Resend, Vercel

---

## File Map

```
/                                    ← project root (Claude_webapp_client_onboarding/)
├── .env.local                       ← credentials (never commit)
├── DECISIONS.md                     ← build decision log
├── next.config.ts
├── tailwind.config.ts               ← includes GWMS brand colors
├── components.json                  ← shadcn config
├── middleware.ts                    ← auth + role-based route protection
├── app/
│   ├── layout.tsx                   ← root layout + error boundary
│   ├── globals.css
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (client)/
│   │   ├── layout.tsx               ← client portal shell + nav
│   │   ├── dashboard/page.tsx       ← S1 client dashboard
│   │   ├── apply/
│   │   │   ├── page.tsx             ← S2 service selector
│   │   │   └── [templateId]/
│   │   │       ├── page.tsx         ← wizard entry (redirect to details)
│   │   │       ├── details/page.tsx ← S3 business details
│   │   │       ├── documents/page.tsx ← S4 document upload + S5 verification
│   │   │       └── review/page.tsx  ← S6 review & submit
│   │   └── applications/
│   │       └── [id]/page.tsx        ← S7 application status
│   ├── (admin)/
│   │   ├── layout.tsx               ← admin portal shell + nav
│   │   ├── dashboard/page.tsx       ← A1 admin dashboard
│   │   ├── queue/page.tsx           ← A2 review queue
│   │   ├── applications/
│   │   │   └── [id]/
│   │   │       ├── page.tsx         ← A3 application detail
│   │   │       └── documents/
│   │   │           └── [docId]/page.tsx ← A4 document viewer
│   │   └── settings/
│   │       ├── templates/page.tsx   ← ST1 template manager
│   │       ├── rules/page.tsx       ← ST2 verification rules
│   │       └── workflow/page.tsx    ← ST3 workflow stages
│   └── api/
│       ├── verify-document/route.ts ← POST: AI verification
│       ├── send-email/route.ts      ← POST: Resend email
│       └── upload/route.ts          ← POST: Supabase Storage upload
├── components/
│   ├── client/
│   │   ├── WizardLayout.tsx         ← step progress indicator
│   │   ├── ServiceCard.tsx          ← template selection card
│   │   ├── DocumentUploadStep.tsx   ← single document upload UI
│   │   ├── VerificationBadge.tsx    ← status badge (verified/flagged/etc)
│   │   ├── UBOForm.tsx              ← repeatable UBO entry form
│   │   └── StatusTimeline.tsx       ← application stage tracker
│   ├── admin/
│   │   ├── ApplicationTable.tsx     ← sortable/filterable queue table
│   │   ├── DocumentViewer.tsx       ← PDF/image + AI result panel
│   │   ├── EmailComposer.tsx        ← inline email drawer
│   │   ├── StageSelector.tsx        ← stage mover dropdown
│   │   └── AuditTrail.tsx           ← timestamped action log
│   └── shared/
│       ├── Navbar.tsx               ← shared nav (client/admin variants)
│       ├── StatusBadge.tsx          ← application status color badge
│       └── LoadingSpinner.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                ← browser Supabase client
│   │   ├── server.ts                ← server Supabase client (SSR cookies)
│   │   └── admin.ts                 ← service role client
│   ├── ai/
│   │   └── verifyDocument.ts        ← Claude API verification logic
│   ├── email/
│   │   └── sendEmail.ts             ← Resend integration
│   └── utils/
│       ├── formatters.ts            ← date, status label helpers
│       └── constants.ts             ← status values, accepted file types
├── stores/
│   └── wizardStore.ts               ← Zustand wizard state
└── types/
    └── index.ts                     ← all shared TypeScript types
```

---

## Phase 1 — Foundation

### Task 1: Initialize Next.js 14 project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `components.json`, `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Initialize project in current directory**

```bash
cd /Users/elaris/Documents/Claude_webapp_client_onboarding
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir no --import-alias "@/*" --yes
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr zustand react-hook-form @hookform/resolvers zod react-dropzone @anthropic-ai/sdk resend
npm install -D @types/node
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```
Accept all defaults. This creates `components.json` and installs `tailwind-merge`, `clsx`, `class-variance-authority`, `lucide-react`, `@radix-ui/*`.

- [ ] **Step 4: Install shadcn components used throughout the app**

```bash
npx shadcn@latest add button card badge input label textarea select dialog sheet table tabs toast sonner form
```

- [ ] **Step 5: Update `tailwind.config.ts` with GWMS brand colors**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#1a365d",
          blue: "#2b6cb0",
          light: "#90cdf4",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#1a365d",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

- [ ] **Step 6: Update `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
  }
}

* {
  border-color: hsl(var(--border));
}

body {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

- [ ] **Step 7: Update `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "GWMS Client Onboarding Portal",
  description: "GWMS Ltd — Beyond Entities, Building Legacies",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create `.env.local`**

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://ylrjcqaelzgjopqqfnmt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscmpjcWFlbHpnam9wcXFmbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzExMDQsImV4cCI6MjA5MDk0NzEwNH0.SK_M54fJVV4bgLbPu8qS06vgybwB8sC72IKf78r1MfY
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscmpjcWFlbHpnam9wcXFmbm10Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3MTEwNCwiZXhwIjoyMDkwOTQ3MTA0fQ.m_eeqaNID7wBalkij9xZypeOqJa3CTd31mnk-Em1cFM
ANTHROPIC_API_KEY=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
RESEND_API_KEY=re_iBUnjfgf_2PAsyXStbuPjCZ7Ccgoqx7Fs
RESEND_FROM_EMAIL=support@elarix.io
EOF
```

- [ ] **Step 9: Create `DECISIONS.md`**

```markdown
# Build Decisions Log

| Date | Decision | Reasoning | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-04-05 | Initialized Next.js 14 in project root | User preferred no subfolder | Subfolder `gwms-onboarding/` |
| 2026-04-05 | Used `@supabase/ssr` instead of `auth-helpers-nextjs` | `auth-helpers-nextjs` is deprecated | `auth-helpers-nextjs` |
| 2026-04-05 | Model: `claude-opus-4-6` | User preference over spec's placeholder model ID | `claude-sonnet-4-6` |
| 2026-04-05 | Admin accounts seeded via SQL | No invite flow needed for POC | Separate invite/register admin flow |
| 2026-04-05 | KYC docs (7-13) uploaded once for primary contact | Per-person uploads deferred to v2 per spec | Per-director/per-UBO upload |
| 2026-04-05 | Using `sonner` for toasts | Better DX than shadcn toast, already in shadcn ecosystem | shadcn toast component |
```

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js 14 project with Tailwind, shadcn/ui, and dependencies"
```

---

### Task 2: TypeScript types

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Create `types/index.ts`**

```typescript
export type UserRole = "client" | "admin";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "pending_action"
  | "verification"
  | "approved"
  | "rejected";

export type VerificationStatus = "pending" | "verified" | "flagged" | "manual_review";

export type DocumentCategory = "corporate" | "kyc" | "compliance";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface ServiceTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  document_requirements?: DocumentRequirement[];
}

export interface DocumentRequirement {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  category: DocumentCategory;
  is_required: boolean;
  sort_order: number;
  verification_rules: VerificationRules | null;
  created_at: string;
}

export interface VerificationRules {
  extract_fields: string[];
  match_rules: MatchRule[];
  document_type_expected?: string;
  notes?: string;
}

export interface MatchRule {
  field: string;
  match_against?: string;
  check?: string;
  required: boolean;
  description: string;
}

export interface UBO {
  full_name: string;
  nationality: string;
  date_of_birth: string;
  ownership_percentage: number;
  passport_number: string;
}

export interface Application {
  id: string;
  client_id: string;
  template_id: string;
  status: ApplicationStatus;
  business_name: string | null;
  business_address: string | null;
  business_country: string | null;
  business_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  ubo_data: UBO[] | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  service_templates?: ServiceTemplate;
}

export interface DocumentUpload {
  id: string;
  application_id: string;
  requirement_id: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  verification_status: VerificationStatus;
  verification_result: VerificationResult | null;
  admin_override: "pass" | "fail" | null;
  admin_override_note: string | null;
  uploaded_at: string;
  verified_at: string | null;
  document_requirements?: DocumentRequirement;
}

export interface VerificationResult {
  can_read_document: boolean;
  document_type_detected: string;
  extracted_fields: Record<string, string>;
  match_results: {
    field: string;
    expected: string;
    found: string;
    passed: boolean;
    note: string;
  }[];
  overall_status: "verified" | "flagged" | "manual_review";
  confidence_score: number;
  flags: string[];
  reasoning: string;
}

export interface AuditLogEntry {
  id: string;
  application_id: string;
  actor_id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
  profiles?: Profile;
}

export interface EmailLogEntry {
  id: string;
  application_id: string;
  sent_by: string;
  to_email: string;
  subject: string;
  body: string;
  resend_id: string | null;
  sent_at: string;
  profiles?: Profile;
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: Supabase clients

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

- [ ] **Step 1: Create `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create `lib/supabase/server.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies set by middleware
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create `lib/supabase/admin.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/
git commit -m "feat: add Supabase browser, server, and admin clients"
```

---

### Task 4: Database schema and seed data

**Files:**
- Create: `supabase/schema.sql`, `supabase/seed.sql`

- [ ] **Step 1: Create `supabase/schema.sql`**

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('client', 'admin')),
  full_name text,
  company_name text,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- SERVICE TEMPLATES
create table service_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- DOCUMENT REQUIREMENTS
create table document_requirements (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references service_templates(id) on delete cascade,
  name text not null,
  description text,
  category text not null check (category in ('corporate', 'kyc', 'compliance')),
  is_required boolean default true,
  sort_order int default 0,
  verification_rules jsonb,
  created_at timestamptz default now()
);

-- APPLICATIONS
create table applications (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references profiles(id),
  template_id uuid references service_templates(id),
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','pending_action','verification','approved','rejected')),
  business_name text,
  business_address text,
  business_country text,
  business_type text,
  contact_name text,
  contact_email text,
  contact_phone text,
  ubo_data jsonb,
  admin_notes text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- DOCUMENT UPLOADS
create table document_uploads (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id) on delete cascade,
  requirement_id uuid references document_requirements(id),
  file_path text,
  file_name text,
  file_size int,
  mime_type text,
  verification_status text default 'pending'
    check (verification_status in ('pending','verified','flagged','manual_review')),
  verification_result jsonb,
  admin_override text check (admin_override in ('pass', 'fail')),
  admin_override_note text,
  uploaded_at timestamptz default now(),
  verified_at timestamptz
);

-- AUDIT LOG
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id),
  actor_id uuid references profiles(id),
  action text not null,
  detail jsonb,
  created_at timestamptz default now()
);

-- EMAIL LOG
create table email_log (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id),
  sent_by uuid references profiles(id),
  to_email text,
  subject text,
  body text,
  resend_id text,
  sent_at timestamptz default now()
);

-- ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table applications enable row level security;
alter table document_uploads enable row level security;
alter table audit_log enable row level security;
alter table email_log enable row level security;
alter table service_templates enable row level security;
alter table document_requirements enable row level security;

-- RLS POLICIES
create policy "clients_own_profile" on profiles for all using (auth.uid() = id);
create policy "clients_own_applications" on applications for all using (auth.uid() = client_id);
create policy "clients_own_uploads" on document_uploads for all
  using (application_id in (select id from applications where client_id = auth.uid()));

-- Service templates and requirements are readable by all authenticated users
create policy "authenticated_read_templates" on service_templates for select using (auth.role() = 'authenticated');
create policy "authenticated_read_requirements" on document_requirements for select using (auth.role() = 'authenticated');

-- Auto-create profile on user registration
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Create `supabase/seed.sql`**

```sql
-- Seed: Service Templates
insert into service_templates (id, name, description) values
  ('11111111-1111-1111-1111-111111111111', 'Global Business Corporation (GBC)', 'Setup and licensing of a GBC for international business through the Mauritius IFC'),
  ('22222222-2222-2222-2222-222222222222', 'Authorised Company (AC)', 'Non-resident company with central management outside Mauritius'),
  ('33333333-3333-3333-3333-333333333333', 'Trust', 'Setup and administration of various trust structures under the Trust Act 2001'),
  ('44444444-4444-4444-4444-444444444444', 'Foundation', 'Setup of charitable or wealth management foundation under Foundations Act 2012'),
  ('55555555-5555-5555-5555-555555555555', 'Collective Investment Scheme (CIS)', 'Fund setup and ongoing administration'),
  ('66666666-6666-6666-6666-666666666666', 'Bank Account Opening', 'Corporate or personal bank account opening assistance');

-- Seed: GBC Document Requirements (Corporate)
insert into document_requirements (template_id, name, description, category, is_required, sort_order, verification_rules) values
  ('11111111-1111-1111-1111-111111111111',
   'Certificate of Incorporation',
   'Upload the original certificate issued by the registrar of companies in the country of incorporation',
   'corporate', true, 1,
   '{"extract_fields":["company_name","incorporation_date","company_number","country"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"certificate_of_incorporation","notes":"Must be certified copy"}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Memorandum and Articles of Association',
   'Upload the full constitutional documents of the company',
   'corporate', true, 2,
   '{"extract_fields":["company_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"memorandum_articles","notes":"Must be certified copy"}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Register of Directors',
   'Current and complete register showing all appointed directors',
   'corporate', true, 3,
   '{"extract_fields":["company_name","directors"],"match_rules":[{"field":"company_name","match_against":"business_name","required":false,"description":"Company name should match application"}],"document_type_expected":"register_of_directors","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Register of Shareholders',
   'Current register showing all shareholders and their ownership percentages',
   'corporate', true, 4,
   '{"extract_fields":["company_name","shareholders","ownership_percentages"],"match_rules":[{"field":"company_name","match_against":"business_name","required":false,"description":"Company name should match application"}],"document_type_expected":"register_of_shareholders","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Proof of Registered Address',
   'Utility bill or official correspondence showing the company''s registered address, dated within 3 months',
   'corporate', true, 5,
   '{"extract_fields":["address","date","company_name"],"match_rules":[{"field":"date","check":"within_3_months","required":true,"description":"Document must be dated within 3 months"}],"document_type_expected":"proof_of_address","notes":"Must be dated within 3 months"}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Certificate of Good Standing',
   'Must be issued within the last 6 months. Required for companies existing more than 12 months',
   'corporate', true, 6,
   '{"extract_fields":["company_name","issue_date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"},{"field":"issue_date","check":"within_6_months","required":true,"description":"Must be issued within last 6 months"}],"document_type_expected":"certificate_of_good_standing","notes":"Must be certified copy"}'::jsonb),

-- Seed: GBC Document Requirements (KYC)
  ('11111111-1111-1111-1111-111111111111',
   'Certified Passport Copy',
   'Clear copy of the bio-data page. Must not be expired. Certified by a notary, lawyer, or bank official. Note: For this demo, upload for the primary contact. In production, this is required per director and UBO.',
   'kyc', true, 7,
   '{"extract_fields":["full_name","passport_number","expiry_date","nationality","date_of_birth"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name on passport must match applicant name"},{"field":"expiry_date","check":"not_expired","required":true,"description":"Passport must not be expired"}],"document_type_expected":"passport","notes":"Accept passports from any country. Reject if photo page is obscured."}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Proof of Residential Address',
   'Utility bill or bank statement showing residential address, dated within 3 months. Name must match passport. Note: For this demo, upload for the primary contact.',
   'kyc', true, 8,
   '{"extract_fields":["full_name","address","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"},{"field":"date","check":"within_3_months","required":true,"description":"Must be dated within 3 months"}],"document_type_expected":"proof_of_residential_address","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Bank Reference Letter',
   'Letter from a recognized bank confirming the individual is a customer in good standing. Note: For this demo, upload for the primary contact.',
   'kyc', true, 9,
   '{"extract_fields":["full_name","bank_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"bank_reference_letter","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Professional Reference Letter',
   'Letter from a lawyer, accountant, or other professional, on official letterhead. Note: For this demo, upload for the primary contact.',
   'kyc', true, 10,
   '{"extract_fields":["full_name","professional_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"professional_reference_letter","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'CV / Resume',
   'Professional CV showing qualifications and business background. Note: For this demo, upload for the primary contact.',
   'kyc', true, 11,
   '{"extract_fields":["full_name"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":false,"description":"Name should match applicant"}],"document_type_expected":"cv_resume","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Source of Funds Declaration',
   'Signed declaration explaining the origin of funds to be used in the business. Note: For this demo, upload for the primary contact.',
   'kyc', true, 12,
   '{"extract_fields":["full_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"source_of_funds_declaration","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Source of Wealth Declaration',
   'Signed declaration explaining how personal wealth was accumulated. Note: For this demo, upload for the primary contact.',
   'kyc', true, 13,
   '{"extract_fields":["full_name","date"],"match_rules":[{"field":"full_name","match_against":"contact_name","required":true,"description":"Name must match applicant"}],"document_type_expected":"source_of_wealth_declaration","notes":null}'::jsonb),

-- Seed: GBC Document Requirements (Compliance)
  ('11111111-1111-1111-1111-111111111111',
   'Business Plan',
   'Detailed description of the proposed business activities, target markets, and projected financials',
   'compliance', true, 14,
   '{"extract_fields":["company_name","business_activities"],"match_rules":[],"document_type_expected":"business_plan","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'AML/CFT Declaration Form',
   'Completed and signed GWMS AML/CFT intake form (download template from portal)',
   'compliance', true, 15,
   '{"extract_fields":["company_name","signatory_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"aml_cft_declaration","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Tax Identification Document',
   'Tax registration or identification document from the home country',
   'compliance', true, 16,
   '{"extract_fields":["company_name","tax_id","country"],"match_rules":[],"document_type_expected":"tax_identification","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Corporate Banker''s Reference',
   'For existing companies: letter from the company''s bank confirming account in good standing',
   'compliance', false, 17,
   '{"extract_fields":["company_name","bank_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":false,"description":"Company name should match application"}],"document_type_expected":"corporate_bankers_reference","notes":null}'::jsonb),

  ('11111111-1111-1111-1111-111111111111',
   'Signed Engagement Letter',
   'GWMS engagement letter signed by authorized signatory (provided by GWMS upon application)',
   'compliance', true, 18,
   '{"extract_fields":["company_name","signatory_name","date"],"match_rules":[{"field":"company_name","match_against":"business_name","required":true,"description":"Company name must match application"}],"document_type_expected":"engagement_letter","notes":"Must be certified copy"}'::jsonb);

-- IMPORTANT: After running this seed, create the admin user:
-- 1. Go to Supabase Dashboard > Authentication > Users > Add user
-- 2. Email: vanes.vr@gmail.com, Password: (set a strong password)
-- 3. Copy the new user's UUID, then run:
--    INSERT INTO profiles (id, role, full_name, email)
--    VALUES ('<UUID>', 'admin', 'Jane Doe', 'vanes.vr@gmail.com')
--    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Jane Doe';
-- Note: The trigger will auto-create a client profile; this UPDATE overrides it to admin.
```

- [ ] **Step 3: Create Supabase storage bucket instructions in `supabase/README.md`**

```markdown
# Supabase Setup

## 1. Run schema
In Supabase SQL editor, run `schema.sql` then `seed.sql` in order.

## 2. Create Storage bucket
In Supabase Dashboard > Storage > New bucket:
- Name: `documents`
- Public: NO (private)
- File size limit: 10MB
- Allowed MIME types: `application/pdf, image/jpeg, image/png`

## 3. Create admin user
Follow instructions at bottom of seed.sql.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema, seed data, and Supabase setup instructions"
```

---

### Task 5: Middleware, utilities, and constants

**Files:**
- Create: `middleware.ts`, `lib/utils/constants.ts`, `lib/utils/formatters.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isClientRoute = path.startsWith("/dashboard") || path.startsWith("/apply") || path.startsWith("/applications");
  const isAdminRoute = path.startsWith("/admin");
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/register");

  // Redirect unauthenticated users to login
  if (!user && (isClientRoute || isAdminRoute)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const destination = profile?.role === "admin" ? "/admin/dashboard" : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Protect admin routes from non-admins
  if (user && isAdminRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Create `lib/utils/constants.ts`**

```typescript
import type { ApplicationStatus, VerificationStatus } from "@/types";

export const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  pending_action: "Action Required",
  verification: "Verification",
  approved: "Approved",
  rejected: "Rejected",
};

export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  pending_action: "bg-orange-100 text-orange-700",
  verification: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  flagged: "Flagged",
  manual_review: "Manual Review",
};

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  verified: "bg-green-100 text-green-700",
  flagged: "bg-amber-100 text-amber-700",
  manual_review: "bg-blue-100 text-blue-700",
};

export const BUSINESS_TYPES = [
  "Corporation",
  "LLC",
  "Partnership",
  "Trust",
  "Foundation",
  "Other",
];

export const WORKFLOW_STAGES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "pending_action",
  "verification",
  "approved",
];
```

- [ ] **Step 3: Create `lib/utils/formatters.ts`**

```typescript
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
```

- [ ] **Step 4: Commit**

```bash
git add middleware.ts lib/utils/
git commit -m "feat: add middleware for auth/role routing, constants, and formatters"
```

---

### Task 6: Shared UI components

**Files:**
- Create: `components/shared/LoadingSpinner.tsx`, `components/shared/StatusBadge.tsx`, `components/shared/Navbar.tsx`

- [ ] **Step 1: Create `components/shared/LoadingSpinner.tsx`**

```tsx
export function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-navy border-t-transparent" />
    </div>
  );
}
```

- [ ] **Step 2: Create `components/shared/StatusBadge.tsx`**

```tsx
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from "@/lib/utils/constants";
import type { ApplicationStatus } from "@/types";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${APPLICATION_STATUS_COLORS[status]}`}>
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 3: Create `components/shared/Navbar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  role: "client" | "admin";
  userName?: string | null;
}

export function Navbar({ role, userName }: NavbarProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b bg-brand-navy">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href={role === "admin" ? "/admin/dashboard" : "/dashboard"}>
            <div className="text-white">
              <div className="text-lg font-semibold">GWMS Ltd</div>
              <div className="text-xs text-brand-light">Beyond Entities, Building Legacies</div>
            </div>
          </Link>
          {role === "admin" && (
            <div className="flex gap-4">
              <Link href="/admin/dashboard" className="text-sm text-brand-light hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link href="/admin/queue" className="text-sm text-brand-light hover:text-white transition-colors">
                Review Queue
              </Link>
              <Link href="/admin/settings/templates" className="text-sm text-brand-light hover:text-white transition-colors">
                Settings
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {userName && (
            <span className="text-sm text-brand-light">{userName}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="border-brand-light text-brand-light hover:bg-brand-blue hover:text-white hover:border-brand-blue"
          >
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/shared/
git commit -m "feat: add shared UI components (Navbar, StatusBadge, LoadingSpinner)"
```

---

### Task 7: Auth pages (Login + Register)

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`

- [ ] **Step 1: Create `app/(auth)/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      router.push(profile?.role === "admin" ? "/admin/dashboard" : "/dashboard");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-navy">GWMS Ltd</h1>
        <p className="text-sm text-gray-500 mt-1">Beyond Entities, Building Legacies</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>Enter your credentials to access the portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-brand-navy hover:bg-brand-blue" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-brand-blue hover:underline">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(auth)/register/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", companyName: "" });

  function update(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.fullName,
            company_name: form.companyName,
            role: "client",
          },
        },
      });
      if (error) throw error;

      // Update profile with company name (trigger creates it, but doesn't have company_name)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ company_name: form.companyName })
          .eq("id", user.id);
      }

      toast.success("Account created! Redirecting…");
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-navy">GWMS Ltd</h1>
        <p className="text-sm text-gray-500 mt-1">Beyond Entities, Building Legacies</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start your GWMS onboarding application</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={form.fullName} onChange={update("fullName")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input id="companyName" value={form.companyName} onChange={update("companyName")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={update("email")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={form.password} onChange={update("password")} minLength={8} required />
            </div>
            <Button type="submit" className="w-full bg-brand-navy hover:bg-brand-blue" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-blue hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: add login and register pages with Supabase auth"
```

---

## Phase 2 — Client Wizard

### Task 8: Zustand wizard store + client layout

**Files:**
- Create: `stores/wizardStore.ts`, `app/(client)/layout.tsx`

- [ ] **Step 1: Create `stores/wizardStore.ts`**

```typescript
import { create } from "zustand";
import type { UBO } from "@/types";

interface BusinessDetails {
  business_name: string;
  business_type: string;
  business_country: string;
  business_address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_title: string;
  ubo_data: UBO[];
}

interface WizardStore {
  applicationId: string | null;
  templateId: string | null;
  businessDetails: BusinessDetails;
  setApplicationId: (id: string) => void;
  setTemplateId: (id: string) => void;
  setBusinessDetails: (details: Partial<BusinessDetails>) => void;
  reset: () => void;
}

const defaultBusinessDetails: BusinessDetails = {
  business_name: "",
  business_type: "",
  business_country: "",
  business_address: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  contact_title: "",
  ubo_data: [],
};

export const useWizardStore = create<WizardStore>((set) => ({
  applicationId: null,
  templateId: null,
  businessDetails: defaultBusinessDetails,
  setApplicationId: (id) => set({ applicationId: id }),
  setTemplateId: (id) => set({ templateId: id }),
  setBusinessDetails: (details) =>
    set((state) => ({
      businessDetails: { ...state.businessDetails, ...details },
    })),
  reset: () =>
    set({ applicationId: null, templateId: null, businessDetails: defaultBusinessDetails }),
}));
```

- [ ] **Step 2: Create `app/(client)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/shared/Navbar";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, company_name")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role="client" userName={profile?.company_name || profile?.full_name} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add stores/ app/\(client\)/layout.tsx
git commit -m "feat: add Zustand wizard store and client portal layout"
```

---

### Task 9: Client dashboard (S1) and service selector (S2)

**Files:**
- Create: `app/(client)/dashboard/page.tsx`, `app/(client)/apply/page.tsx`, `components/client/ServiceCard.tsx`

- [ ] **Step 1: Create `components/client/ServiceCard.tsx`**

```tsx
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ServiceTemplate } from "@/types";

interface ServiceCardProps {
  template: ServiceTemplate & { document_count: number };
}

export function ServiceCard({ template }: ServiceCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base text-brand-navy">{template.name}</CardTitle>
        <CardDescription className="text-sm">{template.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{template.document_count} documents required</span>
        <Link href={`/apply/${template.id}/details`}>
          <Button size="sm" className="bg-brand-navy hover:bg-brand-blue">
            Select
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `app/(client)/dashboard/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/formatters";
import type { Application } from "@/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, full_name")
    .eq("id", user!.id)
    .single();

  const { data: applications } = await supabase
    .from("applications")
    .select("*, service_templates(name)")
    .eq("client_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Welcome, {profile?.company_name || profile?.full_name}
          </h1>
          <p className="text-gray-500 mt-1">Manage your GWMS onboarding applications</p>
        </div>
        <Link href="/apply">
          <Button className="bg-brand-navy hover:bg-brand-blue">Start new application</Button>
        </Link>
      </div>

      {!applications || applications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No applications yet</h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              Start your GWMS onboarding by selecting the service you need
            </p>
            <Link href="/apply">
              <Button className="bg-brand-navy hover:bg-brand-blue">Start new application</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(applications as Application[]).map((app) => (
            <Card key={app.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-brand-navy">{app.business_name || "Untitled Application"}</p>
                  <p className="text-sm text-gray-500">
                    {(app as Application & { service_templates?: { name: string } }).service_templates?.name}
                    {app.submitted_at && ` · Submitted ${formatDate(app.submitted_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={app.status} />
                  <Link href={
                    app.status === "draft"
                      ? `/apply/${app.template_id}/details?applicationId=${app.id}`
                      : `/applications/${app.id}`
                  }>
                    <Button variant="outline" size="sm">
                      {app.status === "draft" ? "Continue" : "View"}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(client)/apply/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { ServiceCard } from "@/components/client/ServiceCard";

export default async function ServiceSelectorPage() {
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("service_templates")
    .select("*, document_requirements(id)")
    .eq("is_active", true)
    .order("name");

  const templatesWithCount = (templates || []).map((t) => ({
    ...t,
    document_count: t.document_requirements?.length || 0,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Start a new application</h1>
        <p className="text-gray-500 mt-1">Select the service you are applying for</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templatesWithCount.map((template) => (
          <ServiceCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(client\)/ components/client/ServiceCard.tsx
git commit -m "feat: add client dashboard (S1) and service selector (S2)"
```

---

### Task 10: Business details form (S3)

**Files:**
- Create: `components/client/UBOForm.tsx`, `components/client/WizardLayout.tsx`, `app/(client)/apply/[templateId]/details/page.tsx`

- [ ] **Step 1: Create `components/client/WizardLayout.tsx`**

```tsx
import { Check } from "lucide-react";

interface WizardLayoutProps {
  currentStep: 1 | 2 | 3;
  children: React.ReactNode;
}

const steps = [
  { num: 1, label: "Business Details" },
  { num: 2, label: "Documents" },
  { num: 3, label: "Review & Submit" },
];

export function WizardLayout({ currentStep, children }: WizardLayoutProps) {
  return (
    <div>
      {/* Step indicator */}
      <nav className="mb-8">
        <ol className="flex items-center">
          {steps.map((step, idx) => (
            <li key={step.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    step.num < currentStep
                      ? "bg-brand-navy text-white"
                      : step.num === currentStep
                      ? "bg-brand-blue text-white"
                      : "border-2 border-gray-300 text-gray-400"
                  }`}
                >
                  {step.num < currentStep ? <Check className="h-4 w-4" /> : step.num}
                </span>
                <span
                  className={`text-sm font-medium ${
                    step.num <= currentStep ? "text-brand-navy" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`mx-4 h-0.5 w-16 ${step.num < currentStep ? "bg-brand-navy" : "bg-gray-200"}`} />
              )}
            </li>
          ))}
        </ol>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/client/UBOForm.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { UBO } from "@/types";

interface UBOFormProps {
  ubos: UBO[];
  onChange: (ubos: UBO[]) => void;
}

const emptyUBO: UBO = {
  full_name: "",
  nationality: "",
  date_of_birth: "",
  ownership_percentage: 0,
  passport_number: "",
};

export function UBOForm({ ubos, onChange }: UBOFormProps) {
  function addUBO() {
    onChange([...ubos, { ...emptyUBO }]);
  }

  function removeUBO(idx: number) {
    onChange(ubos.filter((_, i) => i !== idx));
  }

  function updateUBO(idx: number, field: keyof UBO, value: string | number) {
    const updated = ubos.map((ubo, i) =>
      i === idx ? { ...ubo, [field]: value } : ubo
    );
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        List all individuals owning 25% or more of the entity. Minimum 1 required.
      </p>
      {ubos.map((ubo, idx) => (
        <div key={idx} className="rounded-lg border bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-brand-navy">UBO {idx + 1}</span>
            {ubos.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeUBO(idx)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Full name *</Label>
              <Input
                value={ubo.full_name}
                onChange={(e) => updateUBO(idx, "full_name", e.target.value)}
                placeholder="John Smith"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nationality *</Label>
              <Input
                value={ubo.nationality}
                onChange={(e) => updateUBO(idx, "nationality", e.target.value)}
                placeholder="British"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date of birth *</Label>
              <Input
                type="date"
                value={ubo.date_of_birth}
                onChange={(e) => updateUBO(idx, "date_of_birth", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ownership % *</Label>
              <Input
                type="number"
                min={25}
                max={100}
                value={ubo.ownership_percentage || ""}
                onChange={(e) => updateUBO(idx, "ownership_percentage", Number(e.target.value))}
                required
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Passport number *</Label>
              <Input
                value={ubo.passport_number}
                onChange={(e) => updateUBO(idx, "passport_number", e.target.value)}
                placeholder="AB123456"
                required
              />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addUBO}>
        <Plus className="mr-2 h-4 w-4" /> Add UBO
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(client)/apply/[templateId]/details/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WizardLayout } from "@/components/client/WizardLayout";
import { UBOForm } from "@/components/client/UBOForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWizardStore } from "@/stores/wizardStore";
import { BUSINESS_TYPES } from "@/lib/utils/constants";
import { toast } from "sonner";
import type { UBO } from "@/types";

const COUNTRIES = [
  "Mauritius", "United Kingdom", "France", "United States", "India", "China",
  "Singapore", "South Africa", "United Arab Emirates", "Switzerland", "Other"
];

export default function BusinessDetailsPage({ params }: { params: { templateId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingAppId = searchParams.get("applicationId");
  const supabase = createClient();
  const { applicationId, setApplicationId, setTemplateId, businessDetails, setBusinessDetails } = useWizardStore();

  const [saving, setLoading] = useState(false);
  const [ubos, setUbos] = useState<UBO[]>(businessDetails.ubo_data.length > 0 ? businessDetails.ubo_data : [
    { full_name: "", nationality: "", date_of_birth: "", ownership_percentage: 0, passport_number: "" }
  ]);
  const [form, setForm] = useState({
    business_name: businessDetails.business_name,
    business_type: businessDetails.business_type,
    business_country: businessDetails.business_country,
    business_address: businessDetails.business_address,
    contact_name: businessDetails.contact_name,
    contact_email: businessDetails.contact_email,
    contact_phone: businessDetails.contact_phone,
    contact_title: businessDetails.contact_title,
  });

  useEffect(() => {
    setTemplateId(params.templateId);
    // Load existing application if provided
    if (existingAppId) {
      setApplicationId(existingAppId);
      supabase
        .from("applications")
        .select("*")
        .eq("id", existingAppId)
        .single()
        .then(({ data }) => {
          if (data) {
            setForm({
              business_name: data.business_name || "",
              business_type: data.business_type || "",
              business_country: data.business_country || "",
              business_address: data.business_address || "",
              contact_name: data.contact_name || "",
              contact_email: data.contact_email || "",
              contact_phone: data.contact_phone || "",
              contact_title: "",
            });
            if (data.ubo_data) setUbos(data.ubo_data);
          }
        });
    }
  }, [existingAppId, params.templateId]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function saveProgress(andContinue = false) {
    if (ubos.length === 0 || ubos.some((u) => !u.full_name)) {
      toast.error("At least one complete UBO is required");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        ...form,
        template_id: params.templateId,
        client_id: user!.id,
        ubo_data: ubos,
        status: "draft" as const,
      };

      let appId = applicationId || existingAppId;
      if (appId) {
        await supabase.from("applications").update(payload).eq("id", appId);
      } else {
        const { data, error } = await supabase.from("applications").insert(payload).select().single();
        if (error) throw error;
        appId = data.id;
        setApplicationId(appId!);
      }

      setBusinessDetails({ ...form, ubo_data: ubos });

      if (andContinue) {
        router.push(`/apply/${params.templateId}/documents?applicationId=${appId}`);
      } else {
        toast.success("Progress saved");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardLayout currentStep={1}>
      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Section A: Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Business / Entity name *</Label>
                <Input value={form.business_name} onChange={(e) => updateField("business_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Business type *</Label>
                <Select value={form.business_type} onValueChange={(v) => updateField("business_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Country of incorporation *</Label>
                <Select value={form.business_country} onValueChange={(v) => updateField("business_country", v)}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Registered address *</Label>
                <Textarea value={form.business_address} onChange={(e) => updateField("business_address", e.target.value)} rows={3} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Section B: Primary Contact</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input value={form.contact_name} onChange={(e) => updateField("contact_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Role / title</Label>
                <Input value={form.contact_title} onChange={(e) => updateField("contact_title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => updateField("contact_email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input type="tel" value={form.contact_phone} onChange={(e) => updateField("contact_phone", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Section C: Ultimate Beneficial Owners (UBOs)</CardTitle></CardHeader>
          <CardContent>
            <UBOForm ubos={ubos} onChange={setUbos} />
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => saveProgress(false)} disabled={saving}>
            Save progress
          </Button>
          <Button className="bg-brand-navy hover:bg-brand-blue" onClick={() => saveProgress(true)} disabled={saving}>
            {saving ? "Saving…" : "Next: Upload Documents"}
          </Button>
        </div>
      </div>
    </WizardLayout>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/client/ app/\(client\)/apply/
git commit -m "feat: add wizard layout, UBO form, and business details step (S3)"
```

---

### Task 11: AI verification service

**Files:**
- Create: `lib/ai/verifyDocument.ts`, `app/api/verify-document/route.ts`

- [ ] **Step 1: Create `lib/ai/verifyDocument.ts`**

```typescript
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

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: isImage ? "image" : "document",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "application/pdf",
              data: base64,
            },
          } as Anthropic.ImageBlockParam | Anthropic.RequestDocumentBlock,
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

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
      flags: ["Failed to parse AI response"],
      reasoning: text,
    };
  }
}
```

- [ ] **Step 2: Create `app/api/verify-document/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import type { VerificationRules } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { documentUploadId, applicationId, requirementId } = await request.json();

    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    // Fetch document upload record
    const { data: upload, error: uploadError } = await adminSupabase
      .from("document_uploads")
      .select("*")
      .eq("id", documentUploadId)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json({ error: "Document upload not found" }, { status: 404 });
    }

    // Fetch verification rules
    const { data: requirement } = await adminSupabase
      .from("document_requirements")
      .select("verification_rules")
      .eq("id", requirementId)
      .single();

    // Fetch application context
    const { data: application } = await adminSupabase
      .from("applications")
      .select("contact_name, business_name, ubo_data")
      .eq("id", applicationId)
      .single();

    // Download file from Supabase Storage
    const { data: fileData, error: storageError } = await adminSupabase.storage
      .from("documents")
      .download(upload.file_path!);

    if (storageError || !fileData) {
      return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const rules = (requirement?.verification_rules || {
      extract_fields: [],
      match_rules: [],
    }) as VerificationRules;

    // Run AI verification
    const result = await verifyDocument({
      fileBuffer,
      mimeType: upload.mime_type || "application/pdf",
      rules,
      applicationContext: {
        contact_name: application?.contact_name || null,
        business_name: application?.business_name || null,
        ubo_data: application?.ubo_data || null,
      },
    });

    // Map overall_status to verification_status
    const verificationStatus = result.can_read_document === false
      ? "manual_review"
      : result.overall_status;

    // Update document_uploads record
    await adminSupabase
      .from("document_uploads")
      .update({
        verification_status: verificationStatus,
        verification_result: result,
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentUploadId);

    return NextResponse.json({ result, verificationStatus });
  } catch (err: unknown) {
    console.error("Verification error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/ app/api/verify-document/
git commit -m "feat: add AI document verification via Claude Opus 4.6"
```

---

### Task 12: Document upload step (S4 + S5)

**Files:**
- Create: `components/client/VerificationBadge.tsx`, `components/client/DocumentUploadStep.tsx`, `app/(client)/apply/[templateId]/documents/page.tsx`

- [ ] **Step 1: Create `components/client/VerificationBadge.tsx`**

```tsx
import { VERIFICATION_STATUS_LABELS, VERIFICATION_STATUS_COLORS } from "@/lib/utils/constants";
import type { VerificationStatus } from "@/types";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VERIFICATION_STATUS_COLORS[status]}`}>
      {VERIFICATION_STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create `components/client/DocumentUploadStep.tsx`**

```tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createClient } from "@/lib/supabase/client";
import { VerificationBadge } from "./VerificationBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Upload, FileText, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/utils/constants";
import type { DocumentRequirement, DocumentUpload } from "@/types";

interface DocumentUploadStepProps {
  requirement: DocumentRequirement;
  applicationId: string;
  existingUpload: DocumentUpload | null;
  onUploadComplete: (upload: DocumentUpload) => void;
}

export function DocumentUploadStep({
  requirement,
  applicationId,
  existingUpload,
  onUploadComplete,
}: DocumentUploadStepProps) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<DocumentUpload | null>(existingUpload);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);

    try {
      // Upload to Supabase Storage
      const filePath = `applications/${applicationId}/${requirement.id}/${Date.now()}-${file.name}`;
      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { upsert: true });

      if (storageError) throw storageError;

      // Create or update document_uploads row
      const uploadPayload = {
        application_id: applicationId,
        requirement_id: requirement.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        verification_status: "pending" as const,
        verification_result: null,
        verified_at: null,
      };

      let uploadId: string;
      if (upload?.id) {
        await supabase.from("document_uploads").update(uploadPayload).eq("id", upload.id);
        uploadId = upload.id;
      } else {
        const { data, error } = await supabase
          .from("document_uploads")
          .insert(uploadPayload)
          .select()
          .single();
        if (error) throw error;
        uploadId = data.id;
      }

      setUpload({ ...uploadPayload, id: uploadId, admin_override: null, admin_override_note: null, uploaded_at: new Date().toISOString() });

      // Trigger AI verification
      const res = await fetch("/api/verify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentUploadId: uploadId,
          applicationId,
          requirementId: requirement.id,
        }),
      });

      const { result, verificationStatus, error: verifyError } = await res.json();
      if (verifyError) throw new Error(verifyError);

      const finalUpload: DocumentUpload = {
        id: uploadId,
        application_id: applicationId,
        requirement_id: requirement.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        verification_status: verificationStatus,
        verification_result: result,
        admin_override: null,
        admin_override_note: null,
        uploaded_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      };

      setUpload(finalUpload);
      onUploadComplete(finalUpload);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [applicationId, requirement.id, supabase, upload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const requiresCert = requirement.verification_rules?.notes?.includes("certified") ||
    requirement.verification_rules?.notes?.includes("notarized");

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold text-brand-navy">{requirement.name}</h3>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            requirement.category === "corporate" ? "bg-blue-100 text-blue-700" :
            requirement.category === "kyc" ? "bg-purple-100 text-purple-700" :
            "bg-orange-100 text-orange-700"
          }`}>
            {requirement.category.charAt(0).toUpperCase() + requirement.category.slice(1)}
          </span>
        </div>
        {requirement.description && (
          <p className="text-sm text-gray-600">{requirement.description}</p>
        )}
        {requiresCert && (
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3" /> This document requires a certified or notarized copy
          </p>
        )}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-brand-blue bg-blue-50" : "border-gray-300 hover:border-brand-blue hover:bg-gray-50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          {isDragActive ? "Drop the file here…" : "Drag & drop or click to upload"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 10MB</p>
      </div>

      {/* Verification result */}
      {uploading && (
        <div className="flex items-center gap-2 rounded-lg border bg-gray-50 p-4">
          <LoadingSpinner />
          <span className="text-sm text-gray-600">Uploading and verifying document…</span>
        </div>
      )}

      {upload && !uploading && (
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">{upload.file_name}</span>
            </div>
            <VerificationBadge status={upload.verification_status} />
          </div>

          {upload.verification_status === "verified" && (
            <p className="text-sm text-green-700 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Document verified. Key fields matched successfully.
            </p>
          )}

          {upload.verification_status === "flagged" && upload.verification_result && (
            <div className="text-sm text-amber-700">
              <p className="font-medium mb-1">Issues found:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {upload.verification_result.flags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
                {upload.verification_result.match_results
                  .filter((r) => !r.passed)
                  .map((r, i) => (
                    <li key={`mr-${i}`}>{r.note || `${r.field}: expected "${r.expected}", found "${r.found}"`}</li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">You can re-upload a corrected document above.</p>
            </div>
          )}

          {upload.verification_status === "manual_review" && (
            <p className="text-sm text-blue-700 flex items-center gap-1">
              <Info className="h-4 w-4" /> This document has been queued for manual review by our team.
            </p>
          )}

          {upload.verification_result && upload.verification_result.confidence_score > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              AI confidence: {upload.verification_result.confidence_score}%
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(client)/apply/[templateId]/documents/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WizardLayout } from "@/components/client/WizardLayout";
import { DocumentUploadStep } from "@/components/client/DocumentUploadStep";
import { Button } from "@/components/ui/button";
import { Check, Clock, AlertTriangle, Upload, Info } from "lucide-react";
import { toast } from "sonner";
import type { DocumentRequirement, DocumentUpload } from "@/types";

export default function DocumentsPage({ params }: { params: { templateId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");
  const supabase = createClient();

  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [uploads, setUploads] = useState<Record<string, DocumentUpload>>({});
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (!applicationId) {
      router.push(`/apply/${params.templateId}/details`);
      return;
    }
    async function load() {
      const { data: reqs } = await supabase
        .from("document_requirements")
        .select("*")
        .eq("template_id", params.templateId)
        .order("sort_order");

      setRequirements(reqs || []);

      const { data: existingUploads } = await supabase
        .from("document_uploads")
        .select("*")
        .eq("application_id", applicationId!);

      const uploadMap: Record<string, DocumentUpload> = {};
      (existingUploads || []).forEach((u) => {
        uploadMap[u.requirement_id] = u;
      });
      setUploads(uploadMap);
    }
    load();
  }, [applicationId, params.templateId]);

  function getStatusIcon(reqId: string) {
    const u = uploads[reqId];
    if (!u) return <Upload className="h-4 w-4 text-gray-400" />;
    if (u.verification_status === "verified") return <Check className="h-4 w-4 text-green-600" />;
    if (u.verification_status === "flagged") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    if (u.verification_status === "manual_review") return <Info className="h-4 w-4 text-blue-500" />;
    return <Clock className="h-4 w-4 text-gray-400" />;
  }

  function canProceed() {
    return requirements.every((r) => {
      if (!r.is_required) return true;
      const u = uploads[r.id];
      return u && (u.verification_status === "verified" || u.verification_status === "manual_review");
    });
  }

  if (!applicationId) return null;

  return (
    <WizardLayout currentStep={2}>
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 shrink-0">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
            <ul className="space-y-2">
              {requirements.map((req, idx) => (
                <li key={req.id}>
                  <button
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      idx === currentIdx ? "bg-brand-navy/10 text-brand-navy font-medium" : "hover:bg-gray-50"
                    }`}
                  >
                    {getStatusIcon(req.id)}
                    <span className="truncate">{req.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1">
          {requirements[currentIdx] && (
            <div className="rounded-lg border bg-white p-6">
              <DocumentUploadStep
                requirement={requirements[currentIdx]}
                applicationId={applicationId}
                existingUpload={uploads[requirements[currentIdx].id] || null}
                onUploadComplete={(upload) => {
                  setUploads((prev) => ({
                    ...prev,
                    [requirements[currentIdx].id]: upload,
                  }));
                }}
              />
              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                  disabled={currentIdx === 0}
                >
                  Previous
                </Button>
                {currentIdx < requirements.length - 1 ? (
                  <Button
                    className="bg-brand-navy hover:bg-brand-blue"
                    onClick={() => setCurrentIdx(currentIdx + 1)}
                  >
                    Next document
                  </Button>
                ) : (
                  <Button
                    className="bg-brand-navy hover:bg-brand-blue"
                    onClick={() => router.push(`/apply/${params.templateId}/review?applicationId=${applicationId}`)}
                    disabled={!canProceed()}
                    title={!canProceed() ? "All required documents must be uploaded and verified" : ""}
                  >
                    Proceed to Review
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </WizardLayout>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/client/ app/\(client\)/apply/
git commit -m "feat: add document upload wizard with AI verification feedback (S4/S5)"
```

---

### Task 13: Review & Submit (S6) and Application Status (S7)

**Files:**
- Create: `components/client/StatusTimeline.tsx`, `app/(client)/apply/[templateId]/review/page.tsx`, `app/(client)/applications/[id]/page.tsx`

- [ ] **Step 1: Create `components/client/StatusTimeline.tsx`**

```tsx
import { WORKFLOW_STAGES, APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import { formatDateTime } from "@/lib/utils/formatters";
import { Check } from "lucide-react";
import type { ApplicationStatus, Application } from "@/types";

interface StatusTimelineProps {
  application: Application;
}

export function StatusTimeline({ application }: StatusTimelineProps) {
  const stages = WORKFLOW_STAGES;
  const currentIdx = stages.indexOf(application.status as ApplicationStatus);

  const timestamps: Partial<Record<ApplicationStatus, string | null>> = {
    draft: application.created_at,
    submitted: application.submitted_at,
    in_review: application.reviewed_at,
    approved: application.approved_at,
  };

  return (
    <div className="flex items-start gap-0">
      {stages.map((stage, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={stage} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 z-10 shrink-0 mx-auto ${
                isPast ? "bg-brand-navy border-brand-navy text-white" :
                isCurrent ? "border-brand-blue bg-brand-blue text-white" :
                "border-gray-300 bg-white text-gray-400"
              }`}>
                {isPast ? <Check className="h-4 w-4" /> : <span className="text-xs font-medium">{idx + 1}</span>}
              </div>
              {idx < stages.length - 1 && (
                <div className={`h-0.5 flex-1 ${isPast ? "bg-brand-navy" : "bg-gray-200"}`} />
              )}
            </div>
            <div className="mt-2 text-center px-1">
              <p className={`text-xs font-medium ${isCurrent ? "text-brand-navy" : isPast ? "text-gray-500" : "text-gray-400"}`}>
                {APPLICATION_STATUS_LABELS[stage]}
              </p>
              {timestamps[stage] && (
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(timestamps[stage])}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(client)/apply/[templateId]/review/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WizardLayout } from "@/components/client/WizardLayout";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatters";
import { toast } from "sonner";
import type { Application, DocumentRequirement, DocumentUpload } from "@/types";

export default function ReviewPage({ params }: { params: { templateId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");
  const supabase = createClient();

  const [application, setApplication] = useState<Application | null>(null);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!applicationId) return;
    async function load() {
      const [{ data: app }, { data: reqs }, { data: docs }] = await Promise.all([
        supabase.from("applications").select("*").eq("id", applicationId!).single(),
        supabase.from("document_requirements").select("*").eq("template_id", params.templateId).order("sort_order"),
        supabase.from("document_uploads").select("*").eq("application_id", applicationId!),
      ]);
      setApplication(app);
      setRequirements(reqs || []);
      setUploads(docs || []);
    }
    load();
  }, [applicationId]);

  function canSubmit() {
    return requirements.every((r) => {
      if (!r.is_required) return true;
      const u = uploads.find((u) => u.requirement_id === r.id);
      return u && (u.verification_status === "verified" || u.verification_status === "manual_review");
    });
  }

  async function handleSubmit() {
    if (!applicationId) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("applications").update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }).eq("id", applicationId);

      await supabase.from("audit_log").insert({
        application_id: applicationId,
        actor_id: user!.id,
        action: "application_submitted",
        detail: { previous_status: "draft" },
      });

      toast.success("Application submitted successfully!");
      router.push(`/applications/${applicationId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!application) return null;

  return (
    <WizardLayout currentStep={3}>
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Business Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium text-gray-600">Business name:</span> <span>{application.business_name}</span></div>
            <div><span className="font-medium text-gray-600">Type:</span> <span>{application.business_type}</span></div>
            <div><span className="font-medium text-gray-600">Country:</span> <span>{application.business_country}</span></div>
            <div className="col-span-2"><span className="font-medium text-gray-600">Address:</span> <span>{application.business_address}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Primary Contact</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium text-gray-600">Name:</span> <span>{application.contact_name}</span></div>
            <div><span className="font-medium text-gray-600">Email:</span> <span>{application.contact_email}</span></div>
            <div><span className="font-medium text-gray-600">Phone:</span> <span>{application.contact_phone || "—"}</span></div>
          </CardContent>
        </Card>

        {application.ubo_data && application.ubo_data.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-brand-navy">Ultimate Beneficial Owners</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {application.ubo_data.map((ubo, idx) => (
                <div key={idx} className="text-sm border rounded p-3 bg-gray-50">
                  <p className="font-medium">{ubo.full_name}</p>
                  <p className="text-gray-500">{ubo.nationality} · {ubo.ownership_percentage}% ownership</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Documents</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {requirements.map((req) => {
                const upload = uploads.find((u) => u.requirement_id === req.id);
                return (
                  <li key={req.id} className="flex items-center justify-between py-2 text-sm">
                    <span className={req.is_required ? "" : "text-gray-500"}>{req.name}{!req.is_required && " (optional)"}</span>
                    {upload ? (
                      <VerificationBadge status={upload.verification_status} />
                    ) : (
                      <span className="text-xs text-gray-400">Not uploaded</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {!canSubmit() && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            All required documents must be uploaded and verified (or queued for manual review) before you can submit.
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push(`/apply/${params.templateId}/documents?applicationId=${applicationId}`)}>
            Back to Documents
          </Button>
          <Button
            className="bg-brand-navy hover:bg-brand-blue"
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting}
          >
            {submitting ? "Submitting…" : "Submit Application"}
          </Button>
        </div>
      </div>
    </WizardLayout>
  );
}
```

- [ ] **Step 3: Create `app/(client)/applications/[id]/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { StatusTimeline } from "@/components/client/StatusTimeline";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Application, DocumentUpload, DocumentRequirement } from "@/types";

export default async function ApplicationStatusPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("*, service_templates(name)")
    .eq("id", params.id)
    .single();

  if (!application) return <div className="text-center py-16 text-gray-500">Application not found.</div>;

  const { data: uploads } = await supabase
    .from("document_uploads")
    .select("*, document_requirements(name)")
    .eq("application_id", params.id);

  const app = application as Application & { service_templates?: { name: string } };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{app.business_name || "Application"}</h1>
          <p className="text-gray-500 text-sm">{app.service_templates?.name}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Stage timeline */}
      <Card>
        <CardContent className="pt-6">
          <StatusTimeline application={app} />
        </CardContent>
      </Card>

      {/* Action banners */}
      {app.status === "pending_action" && app.admin_notes && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-700 mb-1">Action required</p>
          <p className="text-sm text-orange-600">{app.admin_notes}</p>
          <Link href={`/apply/${app.template_id}/documents?applicationId=${app.id}`} className="mt-3 inline-block">
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700">Re-upload Documents</Button>
          </Link>
        </div>
      )}

      {app.status === "approved" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
          Your application has been approved. GWMS will be in touch shortly.
        </div>
      )}

      {app.status === "rejected" && app.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Application rejected</p>
          <p className="text-sm text-red-600">{app.rejection_reason}</p>
        </div>
      )}

      {/* Documents */}
      <Card>
        <CardHeader><CardTitle className="text-brand-navy">Documents</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(uploads || []).map((upload) => (
              <li key={upload.id} className="flex items-center justify-between py-2 text-sm">
                <span>{(upload as DocumentUpload & { document_requirements?: DocumentRequirement }).document_requirements?.name}</span>
                <VerificationBadge status={upload.verification_status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Link href="/dashboard">
        <Button variant="outline">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/client/ app/\(client\)/
git commit -m "feat: add review & submit (S6) and application status tracker (S7)"
```

---

## Phase 3 — Admin Portal

### Task 14: Admin layout and dashboard (A1)

**Files:**
- Create: `app/(admin)/layout.tsx`, `app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: Create `app/(admin)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/shared/Navbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role="admin" userName={profile?.full_name} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(admin)/dashboard/page.tsx`**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime, formatActionLabel } from "@/lib/utils/formatters";
import Link from "next/link";
import type { Application, AuditLogEntry } from "@/types";

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const [
    { count: total },
    { count: pending },
    { count: awaitingClient },
    { count: approvedThisMonth },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from("applications").select("*", { count: "exact", head: true }).neq("status", "draft"),
    supabase.from("applications").select("*", { count: "exact", head: true }).in("status", ["submitted", "in_review"]),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "pending_action"),
    supabase.from("applications").select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("approved_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from("audit_log")
      .select("*, profiles(full_name), applications(business_name)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stats = [
    { label: "Total applications", value: total || 0, color: "text-brand-navy" },
    { label: "Pending review", value: pending || 0, color: "text-yellow-600" },
    { label: "Awaiting client action", value: awaitingClient || 0, color: "text-orange-600" },
    { label: "Approved this month", value: approvedThisMonth || 0, color: "text-green-600" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of all onboarding applications</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-brand-navy">Recent Activity</CardTitle>
              <Link href="/admin/queue" className="text-sm text-brand-blue hover:underline">View all →</Link>
            </CardHeader>
            <CardContent>
              {!recentActivity || recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No activity yet</p>
              ) : (
                <ul className="divide-y">
                  {recentActivity.map((entry) => {
                    const e = entry as AuditLogEntry & {
                      profiles?: { full_name: string };
                      applications?: { business_name: string };
                    };
                    return (
                      <li key={e.id} className="py-3 text-sm flex items-start justify-between">
                        <div>
                          <span className="font-medium">{formatActionLabel(e.action)}</span>
                          {e.applications?.business_name && (
                            <span className="text-gray-500"> — {e.applications.business_name}</span>
                          )}
                          {e.profiles?.full_name && (
                            <p className="text-xs text-gray-400">by {e.profiles.full_name}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 ml-4">{formatDateTime(e.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader><CardTitle className="text-brand-navy">Quick Links</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/queue" className="block rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors">
                <p className="font-medium text-brand-navy">Review Queue</p>
                <p className="text-gray-500 text-xs">Review submitted applications</p>
              </Link>
              <Link href="/admin/settings/templates" className="block rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors">
                <p className="font-medium text-brand-navy">Templates</p>
                <p className="text-gray-500 text-xs">Manage document checklists</p>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/
git commit -m "feat: add admin layout and dashboard (A1)"
```

---

### Task 15: Review queue (A2)

**Files:**
- Create: `components/admin/ApplicationTable.tsx`, `app/(admin)/queue/page.tsx`

- [ ] **Step 1: Create `components/admin/ApplicationTable.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/formatters";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { Application, ApplicationStatus } from "@/types";

type ApplicationWithRelations = Application & {
  profiles?: { full_name: string | null; company_name: string | null };
  service_templates?: { name: string };
};

interface ApplicationTableProps {
  applications: ApplicationWithRelations[];
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Submitted", value: "submitted" },
  { label: "In Review", value: "in_review" },
  { label: "Pending Action", value: "pending_action" },
  { label: "Verification", value: "verification" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export function ApplicationTable({ applications }: ApplicationTableProps) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = applications
    .filter((a) => filter === "all" || a.status === filter)
    .filter((a) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        a.business_name?.toLowerCase().includes(q) ||
        a.profiles?.full_name?.toLowerCase().includes(q) ||
        a.profiles?.company_name?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const ta = new Date(a.submitted_at || a.created_at).getTime();
      const tb = new Date(b.submitted_at || b.created_at).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Search by company or client name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Client</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Service</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                <button
                  className="flex items-center gap-1 hover:text-brand-navy"
                  onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                >
                  Submitted
                  {sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                </button>
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No applications found</td>
              </tr>
            ) : (
              filtered.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">{app.profiles?.full_name || "—"}</td>
                  <td className="px-4 py-3 font-medium">{app.business_name || app.profiles?.company_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{app.service_templates?.name || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(app.submitted_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/applications/${app.id}`}>
                      <Button variant="outline" size="sm">Review</Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(admin)/queue/page.tsx`**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { ApplicationTable } from "@/components/admin/ApplicationTable";

export default async function QueuePage() {
  const supabase = createAdminClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("*, profiles(full_name, company_name), service_templates(name)")
    .neq("status", "draft")
    .order("submitted_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Review Queue</h1>
        <p className="text-gray-500 mt-1">All submitted applications</p>
      </div>
      <ApplicationTable applications={applications || []} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/ApplicationTable.tsx app/\(admin\)/queue/
git commit -m "feat: add admin review queue with filter and sort (A2)"
```

---

### Task 16: Email service

**Files:**
- Create: `lib/email/sendEmail.ts`, `app/api/send-email/route.ts`

- [ ] **Step 1: Create `lib/email/sendEmail.ts`**

```typescript
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  applicationId: string;
  sentBy: string;
}

export async function sendClientEmail({ to, subject, body, applicationId, sentBy }: SendEmailParams) {
  const supabase = createAdminClient();

  const { data, error } = await resend.emails.send({
    from: `GWMS Ltd <${process.env.RESEND_FROM_EMAIL!}>`,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">GWMS Ltd</h1>
          <p style="color: #90cdf4; margin: 4px 0 0; font-size: 12px;">Beyond Entities, Building Legacies</p>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          ${body.replace(/\n/g, "<br>")}
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          GWMS Ltd | 365 Royal Road, Rose Hill, Mauritius | +230 454 9670
        </div>
      </div>
    `,
  });

  // Log regardless of success/failure
  await supabase.from("email_log").insert({
    application_id: applicationId,
    sent_by: sentBy,
    to_email: to,
    subject,
    body,
    resend_id: data?.id || null,
  });

  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 2: Create `app/api/send-email/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendClientEmail } from "@/lib/email/sendEmail";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { to, subject, body, applicationId } = await request.json();
    if (!to || !subject || !body || !applicationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await sendClientEmail({ to, subject, body, applicationId, sentBy: user.id });

    // Write audit log
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("audit_log").insert({
      application_id: applicationId,
      actor_id: user.id,
      action: "email_sent",
      detail: { to, subject },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Email failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/email/ app/api/send-email/
git commit -m "feat: add Resend email service and send-email API route"
```

---

### Task 17: Application detail and admin components (A3)

**Files:**
- Create: `components/admin/StageSelector.tsx`, `components/admin/AuditTrail.tsx`, `components/admin/EmailComposer.tsx`, `app/(admin)/applications/[id]/page.tsx`

- [ ] **Step 1: Create `components/admin/StageSelector.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import type { ApplicationStatus } from "@/types";

const MOVABLE_STAGES: ApplicationStatus[] = ["in_review", "pending_action", "verification", "approved", "rejected"];

interface StageSelectorProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
  onStatusChange: (newStatus: ApplicationStatus) => void;
}

export function StageSelector({ applicationId, currentStatus, onStatusChange }: StageSelectorProps) {
  const supabase = createClient();
  const [selected, setSelected] = useState<ApplicationStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const requiresNote = selected === "pending_action" || selected === "rejected";

  async function handleUpdate() {
    if (requiresNote && !note.trim()) {
      toast.error("A note is required for this status change");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const updatePayload: Record<string, unknown> = {
        status: selected,
        updated_at: new Date().toISOString(),
      };
      if (selected === "pending_action") updatePayload.admin_notes = note;
      if (selected === "rejected") updatePayload.rejection_reason = note;
      if (selected === "approved") updatePayload.approved_at = new Date().toISOString();
      if (selected === "in_review") updatePayload.reviewed_at = new Date().toISOString();

      await supabase.from("applications").update(updatePayload).eq("id", applicationId);

      await supabase.from("audit_log").insert({
        application_id: applicationId,
        actor_id: user!.id,
        action: "status_changed",
        detail: { from: currentStatus, to: selected, note: note || null },
      });

      toast.success(`Status updated to ${APPLICATION_STATUS_LABELS[selected]}`);
      onStatusChange(selected);
      setConfirmOpen(false);
      setNote("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-gray-700">Move to stage</Label>
      <div className="flex gap-2">
        <Select value={selected} onValueChange={(v) => setSelected(v as ApplicationStatus)}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOVABLE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => (selected === "approved" || selected === "rejected") ? setConfirmOpen(true) : handleUpdate()}
          disabled={selected === currentStatus || saving}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          Update
        </Button>
      </div>

      {requiresNote && selected !== currentStatus && (
        <div className="space-y-1">
          <Label className="text-xs text-gray-600">{selected === "rejected" ? "Rejection reason *" : "Note for client *"}</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={selected === "rejected" ? "Explain why the application is being rejected…" : "Explain what action the client needs to take…"} />
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {APPLICATION_STATUS_LABELS[selected]}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to mark this application as <strong>{APPLICATION_STATUS_LABELS[selected]}</strong>?
          </p>
          {selected === "rejected" && (
            <div className="space-y-1">
              <Label className="text-sm">Rejection reason *</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Explain why…" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving || (selected === "rejected" && !note.trim())} className={selected === "rejected" ? "bg-red-600 hover:bg-red-700" : "bg-brand-navy hover:bg-brand-blue"}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/admin/AuditTrail.tsx`**

```tsx
import { formatDateTime, formatActionLabel } from "@/lib/utils/formatters";
import type { AuditLogEntry } from "@/types";

interface AuditTrailProps {
  entries: (AuditLogEntry & { profiles?: { full_name: string | null } })[];
}

export function AuditTrail({ entries }: AuditTrailProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 py-4">No audit events yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 text-sm">
          <div className="flex flex-col items-center">
            <div className="h-2 w-2 rounded-full bg-brand-navy mt-1.5 shrink-0" />
            <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
          </div>
          <div className="pb-3">
            <p className="font-medium text-gray-800">{formatActionLabel(entry.action)}</p>
            {entry.profiles?.full_name && (
              <p className="text-gray-500 text-xs">by {entry.profiles.full_name}</p>
            )}
            {entry.detail && Object.keys(entry.detail).length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {JSON.stringify(entry.detail).replace(/[{}"]/g, "").replace(/:/g, ": ").replace(/,/g, " · ")}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(entry.created_at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Create `components/admin/EmailComposer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils/formatters";
import { toast } from "sonner";
import { Mail, ChevronDown } from "lucide-react";
import type { EmailLogEntry } from "@/types";

interface EmailComposerProps {
  applicationId: string;
  clientEmail: string;
  companyName: string;
  previousEmails: EmailLogEntry[];
}

export function EmailComposer({ applicationId, clientEmail, companyName, previousEmails }: EmailComposerProps) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [subject, setSubject] = useState(`Re: Your GWMS Application — ${companyName}`);
  const [body, setBody] = useState("");

  async function handleSend() {
    if (!body.trim()) { toast.error("Email body cannot be empty"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: clientEmail, subject, body, applicationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Email sent successfully");
      setBody("");
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Mail className="h-4 w-4" /> Email Client
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Email Client</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">To</Label>
            <Input value={clientEmail} disabled className="bg-gray-50" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Write your message here…"
            />
          </div>
          <Button onClick={handleSend} disabled={sending} className="w-full bg-brand-navy hover:bg-brand-blue">
            {sending ? "Sending…" : "Send Email"}
          </Button>

          {previousEmails.length > 0 && (
            <div className="mt-6">
              <button
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-navy"
                onClick={() => setShowHistory(!showHistory)}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
                Previous emails ({previousEmails.length})
              </button>
              {showHistory && (
                <ul className="mt-3 space-y-3">
                  {previousEmails.map((e) => (
                    <li key={e.id} className="rounded-lg border bg-gray-50 p-3 text-xs">
                      <p className="font-medium">{e.subject}</p>
                      <p className="text-gray-400 mt-0.5">{formatDateTime(e.sent_at)}</p>
                      <p className="text-gray-600 mt-2 whitespace-pre-wrap">{e.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Create `app/(admin)/applications/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { StageSelector } from "@/components/admin/StageSelector";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { Application, DocumentUpload, DocumentRequirement, AuditLogEntry, EmailLogEntry } from "@/types";

export default async function ApplicationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const [
    { data: application },
    { data: uploads },
    { data: auditLog },
    { data: emailLog },
  ] = await Promise.all([
    supabase.from("applications").select("*, profiles(*), service_templates(name)").eq("id", params.id).single(),
    supabase.from("document_uploads").select("*, document_requirements(name, category)").eq("application_id", params.id).order("uploaded_at"),
    supabase.from("audit_log").select("*, profiles(full_name)").eq("application_id", params.id).order("created_at", { ascending: false }),
    supabase.from("email_log").select("*").eq("application_id", params.id).order("sent_at", { ascending: false }),
  ]);

  if (!application) notFound();

  const app = application as Application & {
    profiles?: { full_name: string | null; company_name: string | null; email: string | null };
    service_templates?: { name: string };
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/queue" className="text-sm text-brand-blue hover:underline mb-1 block">← Back to queue</Link>
          <h1 className="text-2xl font-bold text-brand-navy">{app.business_name || "Application"}</h1>
          <p className="text-gray-500 text-sm">{app.service_templates?.name}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Application info */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-brand-navy text-base">Business Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Business name</span><p className="font-medium">{app.business_name || "—"}</p></div>
              <div><span className="text-gray-500">Type</span><p>{app.business_type || "—"}</p></div>
              <div><span className="text-gray-500">Country</span><p>{app.business_country || "—"}</p></div>
              <div><span className="text-gray-500">Address</span><p>{app.business_address || "—"}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-brand-navy text-base">Primary Contact</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Name</span><p>{app.contact_name || app.profiles?.full_name || "—"}</p></div>
              <div><span className="text-gray-500">Email</span><p>{app.contact_email || app.profiles?.email || "—"}</p></div>
              <div><span className="text-gray-500">Phone</span><p>{app.contact_phone || "—"}</p></div>
            </CardContent>
          </Card>

          {app.ubo_data && app.ubo_data.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-brand-navy text-base">Ultimate Beneficial Owners</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {app.ubo_data.map((ubo, idx) => (
                  <div key={idx} className="rounded border bg-gray-50 p-3 text-sm">
                    <p className="font-medium">{ubo.full_name}</p>
                    <p className="text-gray-500">{ubo.nationality} · {ubo.ownership_percentage}% · DOB: {ubo.date_of_birth} · Passport: {ubo.passport_number}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-brand-navy text-base">Documents</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(uploads || []).map((upload) => {
                  const u = upload as DocumentUpload & { document_requirements?: DocumentRequirement };
                  return (
                    <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{u.document_requirements?.name}</span>
                      <div className="flex items-center gap-3">
                        <VerificationBadge status={u.verification_status} />
                        <Link href={`/admin/applications/${params.id}/documents/${u.id}`} className="text-brand-blue text-xs hover:underline">View</Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right: Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-brand-navy text-base">Stage Management</CardTitle></CardHeader>
            <CardContent>
              <StageSelector
                applicationId={params.id}
                currentStatus={app.status}
                onStatusChange={() => {}}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-brand-navy text-base">Communication</CardTitle></CardHeader>
            <CardContent>
              <EmailComposer
                applicationId={params.id}
                clientEmail={app.contact_email || app.profiles?.email || ""}
                companyName={app.business_name || ""}
                previousEmails={(emailLog || []) as EmailLogEntry[]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-brand-navy text-base">Audit Trail</CardTitle></CardHeader>
            <CardContent>
              <AuditTrail entries={(auditLog || []) as (AuditLogEntry & { profiles?: { full_name: string | null } })[]} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/admin/ app/\(admin\)/applications/
git commit -m "feat: add application detail page with stage management, email, and audit trail (A3)"
```

---

### Task 18: Document viewer (A4)

**Files:**
- Create: `components/admin/DocumentViewer.tsx`, `app/(admin)/applications/[id]/documents/[docId]/page.tsx`

- [ ] **Step 1: Create `components/admin/DocumentViewer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils/formatters";
import type { DocumentUpload, VerificationResult } from "@/types";

interface DocumentViewerProps {
  upload: DocumentUpload;
  signedUrl: string;
}

export function DocumentViewer({ upload, signedUrl }: DocumentViewerProps) {
  const supabase = createClient();
  const [overrideNote, setOverrideNote] = useState(upload.admin_override_note || "");
  const [saving, setSaving] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const result = upload.verification_result as VerificationResult | null;

  async function saveOverride(verdict: "pass" | "fail") {
    if (verdict === "fail" && !overrideNote.trim()) {
      toast.error("A note is required when overriding to fail");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("document_uploads").update({
        admin_override: verdict,
        admin_override_note: overrideNote || null,
        verification_status: verdict === "pass" ? "verified" : "flagged",
      }).eq("id", upload.id);

      await supabase.from("audit_log").insert({
        application_id: upload.application_id,
        actor_id: user!.id,
        action: "document_override",
        detail: { document_id: upload.id, verdict, note: overrideNote || null },
      });

      toast.success(`Document marked as ${verdict === "pass" ? "verified" : "failed"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Override failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
      {/* Left: Document preview */}
      <div className="rounded-lg border bg-white overflow-hidden">
        {upload.mime_type?.startsWith("image/") ? (
          <img src={signedUrl} alt={upload.file_name || "Document"} className="w-full h-full object-contain" />
        ) : (
          <iframe src={signedUrl} className="w-full h-full" title={upload.file_name || "Document"} />
        )}
      </div>

      {/* Right: Verification panel */}
      <div className="overflow-y-auto space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-brand-navy">Verification Result</CardTitle>
              <VerificationBadge status={upload.verification_status} />
            </div>
          </CardHeader>
          {result && (
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Confidence score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${result.confidence_score >= 75 ? "bg-green-500" : result.confidence_score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${result.confidence_score}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{result.confidence_score}%</span>
                </div>
              </div>

              {Object.keys(result.extracted_fields).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Extracted fields</p>
                  <dl className="space-y-1">
                    {Object.entries(result.extracted_fields).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-gray-500 capitalize min-w-[120px]">{k.replace(/_/g, " ")}</dt>
                        <dd className="font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {result.match_results.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Match results</p>
                  <ul className="space-y-1">
                    {result.match_results.map((r, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        {r.passed
                          ? <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          : <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        }
                        <span className={r.passed ? "text-green-700" : "text-red-600"}>{r.note || `${r.field}: ${r.found}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.flags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Flags</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                    {result.flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              <div>
                <button
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-navy"
                  onClick={() => setShowReasoning(!showReasoning)}
                >
                  {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  AI reasoning
                </button>
                {showReasoning && (
                  <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2 whitespace-pre-wrap">{result.reasoning}</p>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-navy">Admin Override</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upload.admin_override && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                Previous override: <strong>{upload.admin_override === "pass" ? "Passed" : "Failed"}</strong>
                {upload.admin_override_note && <> — {upload.admin_override_note}</>}
                <br />
                <span className="text-gray-400">{formatDateTime(upload.verified_at)}</span>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Override note {upload.admin_override === "fail" || "required if failing"}</Label>
              <Textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} rows={3} placeholder="Add a note explaining your override…" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveOverride("pass")} disabled={saving} className="bg-green-600 hover:bg-green-700 flex-1">
                <Check className="h-3 w-3 mr-1" /> Mark as Pass
              </Button>
              <Button size="sm" onClick={() => saveOverride("fail")} disabled={saving} variant="destructive" className="flex-1">
                <X className="h-3 w-3 mr-1" /> Mark as Fail
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(admin)/applications/[id]/documents/[docId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import Link from "next/link";
import type { DocumentUpload, DocumentRequirement } from "@/types";

export default async function DocumentViewerPage({ params }: { params: { id: string; docId: string } }) {
  const supabase = createAdminClient();

  const { data: upload } = await supabase
    .from("document_uploads")
    .select("*, document_requirements(name, description, category)")
    .eq("id", params.docId)
    .single();

  if (!upload || !upload.file_path) notFound();

  const { data: signedUrlData } = await supabase.storage
    .from("documents")
    .createSignedUrl(upload.file_path, 3600);

  if (!signedUrlData?.signedUrl) notFound();

  const u = upload as DocumentUpload & { document_requirements?: DocumentRequirement };

  return (
    <div>
      <div className="mb-4">
        <Link href={`/admin/applications/${params.id}`} className="text-sm text-brand-blue hover:underline">
          ← Back to application
        </Link>
        <h2 className="text-xl font-bold text-brand-navy mt-1">{u.document_requirements?.name}</h2>
        {u.document_requirements?.description && (
          <p className="text-sm text-gray-500">{u.document_requirements.description}</p>
        )}
      </div>
      <DocumentViewer upload={u} signedUrl={signedUrlData.signedUrl} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/DocumentViewer.tsx app/\(admin\)/applications/
git commit -m "feat: add document viewer with AI result panel and admin override (A4)"
```

---

## Phase 4 — Settings

### Task 19: Template manager (ST1)

**Files:**
- Create: `app/(admin)/settings/templates/page.tsx`

- [ ] **Step 1: Create `app/(admin)/settings/templates/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";
import type { ServiceTemplate, DocumentRequirement, DocumentCategory } from "@/types";

export default function TemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<(ServiceTemplate & { document_requirements?: DocumentRequirement[] })[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newTemplate, setNewTemplate] = useState({ name: "", description: "" });
  const [newDoc, setNewDoc] = useState({
    name: "", description: "", category: "corporate" as DocumentCategory,
    is_required: true
  });

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    const { data } = await supabase
      .from("service_templates")
      .select("*, document_requirements(*)")
      .order("name");
    setTemplates(data || []);
    setLoading(false);
  }

  const selectedTemplate = templates.find((t) => t.id === selected);

  async function createTemplate() {
    if (!newTemplate.name.trim()) return;
    const { error } = await supabase.from("service_templates").insert({
      name: newTemplate.name,
      description: newTemplate.description || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Template created");
    setNewTemplateOpen(false);
    setNewTemplate({ name: "", description: "" });
    loadTemplates();
  }

  async function toggleTemplateActive(id: string, current: boolean) {
    await supabase.from("service_templates").update({ is_active: !current }).eq("id", id);
    loadTemplates();
  }

  async function addDocument() {
    if (!selected || !newDoc.name.trim()) return;
    const maxOrder = (selectedTemplate?.document_requirements?.length || 0) + 1;
    const { error } = await supabase.from("document_requirements").insert({
      template_id: selected,
      name: newDoc.name,
      description: newDoc.description || null,
      category: newDoc.category,
      is_required: newDoc.is_required,
      sort_order: maxOrder,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Document requirement added");
    setAddDocOpen(false);
    setNewDoc({ name: "", description: "", category: "corporate", is_required: true });
    loadTemplates();
  }

  async function deleteDocument(docId: string) {
    if (!confirm("Delete this document requirement?")) return;
    await supabase.from("document_requirements").delete().eq("id", docId);
    loadTemplates();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Template Manager</h1>
          <p className="text-gray-500 text-sm mt-1">Configure document checklists per service type</p>
        </div>
        <Button onClick={() => setNewTemplateOpen(true)} className="bg-brand-navy hover:bg-brand-blue">
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Template list */}
        <div className="space-y-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${selected === t.id ? "border-brand-navy bg-brand-navy/5" : "hover:bg-gray-50"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-brand-navy">{t.name}</span>
                <Switch
                  checked={t.is_active}
                  onCheckedChange={() => toggleTemplateActive(t.id, t.is_active)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{t.document_requirements?.length || 0} documents</p>
            </button>
          ))}
        </div>

        {/* Document requirements */}
        <div className="col-span-2">
          {selectedTemplate ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-brand-navy text-base">{selectedTemplate.name}</CardTitle>
                <Button size="sm" onClick={() => setAddDocOpen(true)} className="bg-brand-navy hover:bg-brand-blue">
                  <Plus className="mr-1 h-3 w-3" /> Add Document
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {(selectedTemplate.document_requirements || [])
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{doc.name}</span>
                            <Badge variant="outline" className="text-xs capitalize">{doc.category}</Badge>
                            {!doc.is_required && <Badge variant="outline" className="text-xs text-gray-400">Optional</Badge>}
                          </div>
                          {doc.description && <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deleteDocument(doc.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm border-2 border-dashed rounded-lg">
              Select a template to manage its documents
            </div>
          )}
        </div>
      </div>

      {/* New template dialog */}
      <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Service Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Template name *</Label>
              <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTemplateOpen(false)}>Cancel</Button>
            <Button onClick={createTemplate} className="bg-brand-navy hover:bg-brand-blue">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add document dialog */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document Requirement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Document name *</Label>
              <Input value={newDoc.name} onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Instructions for client</Label>
              <Textarea value={newDoc.description} onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={newDoc.category} onValueChange={(v) => setNewDoc({ ...newDoc, category: v as DocumentCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="kyc">KYC</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={newDoc.is_required} onCheckedChange={(v) => setNewDoc({ ...newDoc, is_required: v })} />
                <Label className="text-sm">Required</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDocOpen(false)}>Cancel</Button>
            <Button onClick={addDocument} className="bg-brand-navy hover:bg-brand-blue">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/settings/templates/
git commit -m "feat: add template manager with CRUD for templates and document requirements (ST1)"
```

---

### Task 20: Verification rules editor (ST2) and workflow display (ST3)

**Files:**
- Create: `app/(admin)/settings/rules/page.tsx`, `app/(admin)/settings/workflow/page.tsx`

- [ ] **Step 1: Create `app/(admin)/settings/rules/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { DocumentRequirement } from "@/types";

export default function VerificationRulesPage() {
  const supabase = createClient();
  const [requirements, setRequirements] = useState<(DocumentRequirement & { service_templates?: { name: string } })[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [jsonValue, setJsonValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("document_requirements")
      .select("*, service_templates(name)")
      .order("template_id")
      .then(({ data }) => setRequirements(data || []));
  }, []);

  function selectRequirement(req: DocumentRequirement) {
    setSelected(req.id);
    setJsonValue(JSON.stringify(req.verification_rules || {}, null, 2));
    setJsonError(null);
  }

  function handleJsonChange(value: string) {
    setJsonValue(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }

  async function saveRules() {
    if (!selected || jsonError) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(jsonValue);
      await supabase.from("document_requirements").update({ verification_rules: parsed }).eq("id", selected);
      toast.success("Verification rules saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selectedReq = requirements.find((r) => r.id === selected);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Verification Rules</h1>
        <p className="text-gray-500 text-sm mt-1">Edit AI verification rules per document type (JSON editor)</p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-1 overflow-y-auto max-h-[70vh]">
          {requirements.map((req) => (
            <button
              key={req.id}
              onClick={() => selectRequirement(req)}
              className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${selected === req.id ? "border-brand-navy bg-brand-navy/5" : "hover:bg-gray-50"}`}
            >
              <p className="font-medium text-brand-navy truncate">{req.name}</p>
              <p className="text-xs text-gray-400">{req.service_templates?.name}</p>
            </button>
          ))}
        </div>
        <div className="col-span-2">
          {selectedReq ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-brand-navy text-base">{selectedReq.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={jsonValue}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={20}
                  className="font-mono text-xs"
                />
                {jsonError && <p className="text-xs text-red-500">JSON error: {jsonError}</p>}
                <Button onClick={saveRules} disabled={saving || !!jsonError} className="bg-brand-navy hover:bg-brand-blue">
                  {saving ? "Saving…" : "Save Rules"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm border-2 border-dashed rounded-lg">
              Select a document to edit its verification rules
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(admin)/settings/workflow/page.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import type { ApplicationStatus } from "@/types";

const WORKFLOW_DESCRIPTION: Record<ApplicationStatus, string> = {
  draft: "Client has started the application but not yet submitted it.",
  submitted: "Client submitted the application. Appears in the admin review queue.",
  in_review: "An admin has opened the application and is actively reviewing it.",
  pending_action: "Admin has flagged an issue. Client is notified to re-upload documents or take action.",
  verification: "Application passed initial review. Undergoing final compliance checks.",
  approved: "Application fully approved by GWMS. Client notified.",
  rejected: "Application rejected. Reason is shown to the client.",
};

const STAGES: ApplicationStatus[] = ["draft", "submitted", "in_review", "pending_action", "verification", "approved", "rejected"];

export default function WorkflowPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Workflow Stages</h1>
        <p className="text-gray-500 text-sm mt-1">Fixed workflow stages for the onboarding process. Stage customization coming in v2.</p>
      </div>
      <div className="space-y-3 max-w-2xl">
        {STAGES.map((stage, idx) => (
          <Card key={stage}>
            <CardContent className="flex items-start gap-4 pt-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white text-sm font-medium">
                {idx + 1}
              </div>
              <div>
                <p className="font-medium text-brand-navy">{APPLICATION_STATUS_LABELS[stage]}</p>
                <p className="text-sm text-gray-500 mt-0.5">{WORKFLOW_DESCRIPTION[stage]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/settings/
git commit -m "feat: add verification rules JSON editor (ST2) and workflow stages display (ST3)"
```

---

## Phase 5 — Polish

### Task 21: Root redirects, error boundary, and README

**Files:**
- Create/Modify: `app/page.tsx`, `app/error.tsx`, `README.md`

- [ ] **Step 1: Update `app/page.tsx` to redirect to login**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile?.role === "admin" ? "/admin/dashboard" : "/dashboard");
}
```

- [ ] **Step 2: Create `app/error.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-brand-navy mb-2">Something went wrong</h2>
        <p className="text-gray-500 text-sm mb-6">{error.message || "An unexpected error occurred."}</p>
        <Button onClick={reset} className="bg-brand-navy hover:bg-brand-blue">Try again</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(client)/apply/[templateId]/page.tsx` (redirect entry)**

```tsx
import { redirect } from "next/navigation";

export default function WizardEntryPage({ params }: { params: { templateId: string } }) {
  redirect(`/apply/${params.templateId}/details`);
}
```

- [ ] **Step 4: Create `README.md`**

```markdown
# GWMS Client Onboarding Portal

A two-portal web app for GWMS Ltd to digitize their KYC/AML client onboarding process.

## Setup

### 1. Install dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Configure environment
Copy `.env.local` is already set up with credentials.

### 3. Set up Supabase
1. Run `supabase/schema.sql` in your Supabase SQL editor
2. Run `supabase/seed.sql` in your Supabase SQL editor
3. Create a private Storage bucket named `documents` (10MB limit, PDF/JPG/PNG)
4. Create the admin user — see instructions at the bottom of `supabase/seed.sql`

### 4. Run the development server
\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000).

## Portals

- **Client portal**: `/dashboard` — register as a client and submit an onboarding application
- **Admin portal**: `/admin/dashboard` — log in as Jane Doe (`vanes.vr@gmail.com`) to review applications

## Tech Stack

Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Supabase · Claude Opus 4.6 · Resend · Vercel

## Build Decisions

See `DECISIONS.md` for all non-trivial architectural decisions made during the build.
```

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete GWMS client onboarding portal POC"
```

---

## Spec Coverage Check

| Spec Section | Covered By |
|---|---|
| Auth (login/register + role redirect) | Tasks 7, 5 |
| S1 Client dashboard | Task 9 |
| S2 Service selector | Task 9 |
| S3 Business details + UBOs | Task 10 |
| S4 Document upload wizard | Task 12 |
| S5 Verification feedback (inline) | Task 12 |
| S6 Review & submit | Task 13 |
| S7 Application status timeline | Task 13 |
| A1 Admin dashboard with stats | Task 14 |
| A2 Review queue with filters | Task 15 |
| A3 Application detail + stage mover | Task 17 |
| A4 Document viewer + AI panel + override | Task 18 |
| A5 Email composer (drawer) | Task 17 |
| A6 Approve/reject modal | Task 17 (in StageSelector confirm dialog) |
| ST1 Template manager | Task 19 |
| ST2 Verification rules editor | Task 20 |
| ST3 Workflow stages (read-only) | Task 20 |
| AI verification via Claude | Tasks 11 |
| Resend email + email_log | Task 16 |
| Audit log writes | Tasks 13, 17, 18 |
| Database schema + RLS | Task 4 |
| Supabase Storage (private bucket) | Task 12 |
| GWMS brand colors | Task 1 |
| DECISIONS.md | Task 1 |
| README | Task 21 |
| Error boundary | Task 21 |
| Test admin (Jane Doe) | Task 4 (seed.sql notes) |
