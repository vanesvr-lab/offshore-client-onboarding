# Claude Code Guide — Client Onboarding Web App

## Project Overview

A web application for client onboarding. Guides new clients through account setup, document submission, and verification steps.

## Architecture

- **Frontend**: (define your stack here, e.g., React + Vite, Next.js, etc.)
- **Backend**: (e.g., Node/Express, FastAPI, etc.)
- **Database**: (e.g., PostgreSQL, Supabase, etc.)
- **Auth**: (e.g., Clerk, Auth.js, Supabase Auth, etc.)

## Key Conventions

- Use TypeScript throughout
- Prefer named exports over default exports
- Co-locate component styles with components
- Keep business logic out of UI components — use hooks or service modules

## File Structure

```
src/
  components/    # Reusable UI components
  pages/         # Route-level components
  hooks/         # Custom React hooks
  services/      # API calls and external integrations
  lib/           # Utilities and helpers
  types/         # Shared TypeScript types
```

## Dev Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run test      # Run tests
npm run lint      # Lint and type-check
```

## Code Quality

- Run lint and type-check before considering any task done
- Do not disable TypeScript strict mode
- Prefer explicit types over `any`
- Write tests for business logic and API integrations

## What NOT to Do

- Do not add features beyond what is asked
- Do not mock external services in integration tests
- Do not commit `.env` files or secrets
- Do not use `console.log` in production code — use a proper logger
