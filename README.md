# GWMS Client Onboarding Portal

A two-portal KYC/AML onboarding web application for GWMS Ltd. Guides new clients through account setup, document submission, and AI-powered verification.

## Features

### Client Portal
- Service template selection (General Business Client, etc.)
- 3-step wizard: business details → document upload → review & submit
- Real-time AI document verification using Claude Opus
- Application status tracking with timeline
- Action notifications for pending items

### Admin Portal
- Review queue with search and filtering
- Application detail view with business info and UBO data
- AI-powered document viewer with confidence scores and field extraction
- Manual pass/fail override for documents
- Stage management with audit trail
- Email composer (Resend) for client communication
- Settings: service templates, verification rules, workflow overview

## Tech Stack

- **Framework**: Next.js 14 App Router (TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (private `documents` bucket)
- **AI**: Anthropic Claude Opus (`claude-opus-4-6`)
- **Email**: Resend
- **State**: Zustand (wizard), react-hook-form + zod (forms)

## Prerequisites

- Node.js 18+
- A Supabase project
- Anthropic API key
- Resend API key

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in your credentials:

```bash
cp .env.local.example .env.local
```

Required variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=support@yourdomain.com
```

### 3. Set up the database

Run the schema and seed files in your Supabase SQL editor:

```
supabase/schema.sql   # Tables, RLS policies, triggers
supabase/seed.sql     # Service templates and document requirements
```

### 4. Create the documents storage bucket

In the Supabase dashboard → Storage, create a **private** bucket named `documents`.

### 5. Create the admin user

1. In Supabase dashboard → Authentication → Users, create a user with email and password.
2. Run this SQL to grant admin role (replace with your user's ID):

```sql
UPDATE profiles SET role = 'admin', full_name = 'Jane Doe' WHERE id = 'your-user-uuid';
```

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # Lint and type-check
```

## Project Structure

```
src/
  app/
    (auth)/       # Login, register pages
    (client)/     # Client portal: dashboard, apply wizard, applications
    (admin)/      # Admin portal: dashboard, queue, application detail, settings
    api/          # API routes: verify-document, send-email
  components/
    ui/           # shadcn/ui primitives
    shared/       # Navbar, StatusBadge, LoadingSpinner
    client/       # Wizard components, document upload, status timeline
    admin/        # Application table, document viewer, stage selector, email composer
  lib/
    supabase/     # Browser, server, and admin Supabase clients
    ai/           # Claude document verification
    email/        # Resend email integration
    utils/        # Constants, formatters
  stores/         # Zustand wizard store
  types/          # Shared TypeScript types
supabase/
  schema.sql      # Database schema
  seed.sql        # Seed data
```

## Workflow Stages

| Stage | Description |
|-------|-------------|
| Draft | Client started but not submitted |
| Submitted | In admin review queue |
| In Review | Admin actively reviewing |
| Pending Action | Client must re-upload or take action |
| Verification | Final compliance checks |
| Approved | Fully approved |
| Rejected | Rejected with reason |
