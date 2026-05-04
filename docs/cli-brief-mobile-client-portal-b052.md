# B-052 — Mobile-friendly client portal

## Why

Tech-debt #19 in CHANGES.md documents that the client `Sidebar` is mounted
with `w-[260px] shrink-0` at all viewports, leaving ~115px of usable width
at 375px. This forces horizontal scroll on every wizard page and makes the
KYC invite flow (which is overwhelmingly accessed on mobile) painful.

A previous audit (Claude Desktop, 2026-05-04) confirmed:

- **Sidebar**: no responsive variant — always 260px.
- **Review page** (`src/app/(client)/apply/[templateId]/review/page.tsx`): two `grid grid-cols-2` blocks at lines **86** and **214** with no `md:` prefix → 2 columns even at 320px.
- **Touch targets**: primary CTAs are `h-11` (44pt) ✓, but icon buttons (`h-3 w-3` to `h-3.5 w-3.5`) and several text-link clickables are well below 44pt.
- **Document upload** (`src/components/shared/DocumentUploadWidget.tsx`): drag-drop only on desktop; mobile gets a generic file picker — no native camera capture path.
- **Tailwind breakpoints**: defaults (`sm 640 / md 768 / lg 1024 / xl 1280`).
- **`Sheet` component** already lives in `src/components/ui/sheet.tsx` — no new dep needed for the drawer pattern.

Goal: make every client-facing page usable at 375px without horizontal
scroll, with comfortable touch targets and native camera capture for
document upload. Admin portal is **out of scope** for this batch (admins
use desktop).

## Scope

- **In**: Sidebar drawer pattern; wizard step pages (details, documents, review); `/dashboard`, `/applications/[id]`, `/services/[id]`; KYC fill page (`/kyc`, `/kyc/fill/[token]`); document upload camera capture; touch-target audit across the client surface.
- **Out**: Admin portal layouts (`(admin)/...`). Admin sidebar can stay desktop-only for now — flag as new tech-debt entry if you spot anything.

## Working agreement

Do NOT stop between batches. After each batch: `git status` → stage → commit
with a descriptive message (no batch ID per CLAUDE.md) → push → update
CHANGES.md. If you hit a real blocker, document it in CHANGES.md and stop.

After every batch verify on three viewport widths in dev:

- **375 × 667** (iPhone SE)
- **414 × 896** (iPhone 11)
- **768 × 1024** (iPad portrait, where `md:` kicks in)

Use Chrome devtools or Playwright's `--ui` mode. Confirm no horizontal scroll.

---

## Batch 1 — Sidebar mobile drawer

The critical unblocker. After Batch 1, every client page should stop
horizontally scrolling at 375px even before any per-page fixes.

### 1.1 — Make `Sidebar` responsive

`src/components/shared/Sidebar.tsx`:
- Wrap the existing sidebar markup so it renders inline (`w-[260px] shrink-0`) at `md:` and above, and inside a `Sheet` (`src/components/ui/sheet.tsx`) drawer below `md`.
- Drawer side: `left`, width `w-[280px]` (slightly wider than desktop so touch targets get more breathing room).
- Auto-close the drawer on route change. Use `usePathname()` and a `useEffect` to flip the open state to false when the path changes.

Implementation hint:
```tsx
const [open, setOpen] = useState(false);
const pathname = usePathname();
useEffect(() => setOpen(false), [pathname]);

return (
  <>
    {/* Desktop */}
    <aside className="hidden md:flex w-[260px] shrink-0 ...">
      {sidebarContent}
    </aside>
    {/* Mobile */}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[280px] p-0 md:hidden">
        {sidebarContent}
      </SheetContent>
    </Sheet>
  </>
);
```

Expose an imperative open trigger via context OR by lifting `open` state
into the layout. Cleanest path: lift state to `(client)/layout.tsx` and
pass `onOpenMobile` to `Header`.

### 1.2 — Add a burger trigger in `Header`

`src/components/shared/Header.tsx`:
- Render a `Menu` icon button (Lucide `Menu`, h-6 w-6) on `md:hidden` only.
- Positioned at the start of the header, before the brand/logo.
- `aria-label="Open navigation"`, `h-11 w-11` hit area.
- Wires up to the lifted `open` state.

### 1.3 — Update `(client)/layout.tsx`

`src/app/(client)/layout.tsx`:
- Lift the `mobileSidebarOpen` state into the layout's client-component child if needed (the layout is async/server, so the state has to live in a client wrapper). Easiest: extract a `<ClientShell>` client component that owns the state and renders Header + Sidebar + main.
- Reduce main padding on mobile: change `<div className="p-8">` to `<div className="p-4 md:p-8">`.
- Remove the implicit horizontal scroll source: keep `flex-1 min-w-0 overflow-auto` on `main`.

### 1.4 — Same treatment for the admin layout? **No.**

Per scope: skip. Add a single line to CHANGES.md tech-debt: "Admin sidebar
not yet mobile-friendly — admins use desktop, deferred."

### 1.5 — Verify Batch 1

- Hot-reload the dev server, open `/dashboard` at 375px → no horizontal scroll, burger menu opens drawer, drawer closes on link tap.
- Open at 768px → drawer hidden, inline sidebar visible.
- Verify keyboard nav: Tab cycle through burger → drawer items when open.

**Commit/push**: `feat: collapse client sidebar to mobile drawer`

---

## Batch 2 — Wizard step page mobile fixes

### 2.1 — Review page grid-cols bug fixes

`src/app/(client)/apply/[templateId]/review/page.tsx`:

- **Line 86**: `<div className="grid grid-cols-2 gap-3">` (the kyc/fields progress row inside the per-person card) → change to `grid grid-cols-1 sm:grid-cols-2 gap-3`.
- **Line 214**: `<CardContent className="grid grid-cols-2 gap-4 text-sm">` (Primary Contact card) → `grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm`.

After this change, scan the rest of the file for any other `grid-cols-N`
without an `md:`/`sm:` prefix and fix those too. Use:
```bash
grep -n "grid-cols-" src/app/\(client\)/apply/\[templateId\]/review/page.tsx
```

### 2.2 — Audit Details and Documents pages

- `src/app/(client)/apply/[templateId]/details/page.tsx`
- `src/app/(client)/apply/[templateId]/documents/page.tsx`

Both already use `grid grid-cols-1 md:grid-cols-2` for most rows, but verify at 375px:
- All input widths use `md:w-NN` (so they're `w-auto`/full on mobile) — confirm none is `w-[Npx]` without the `md:` prefix.
- Buttons stack or wrap cleanly. The wizard footer (Save/Back/Next) often becomes cramped on mobile — use `flex flex-col sm:flex-row gap-2` instead of horizontal-only.

### 2.3 — `WizardLayout` container check

`src/components/client/WizardLayout.tsx` uses `mx-auto w-full max-w-2xl`.
That's fine for desktop but on mobile the inner padding still applies.
Confirm there's no `min-w-` or fixed-width child blowing out the container.

### 2.4 — Stepper / progress indicator on mobile

If the wizard renders a top stepper (`Details → Documents → Review`),
ensure it doesn't horizontal-scroll at 375px. Common patterns:
- Show only the current step name on mobile, full stepper on `md:`.
- OR collapse to a `<select>` on mobile (less common).
- OR a slim progress bar on mobile, full stepper on desktop.

Pick the lightest-weight option that matches the existing visual style.

### 2.5 — Verify Batch 2

- All three wizard pages at 375px / 414px / 768px → no horizontal scroll, no overlapping text.
- Review page: Primary Contact card stacks Name/Email/Phone vertically at 375px, becomes 2-col at ≥640px.

**Commit/push**: `fix: wizard pages reflow cleanly on mobile`

---

## Batch 3 — Touch targets + camera capture + remaining client routes

### 3.1 — Document upload mobile camera

`src/components/shared/DocumentUploadWidget.tsx`:

The current `react-dropzone` config uses `noClick: true, noKeyboard: true`
and a manual `open()` button. Add a **second** trigger visible only on
touch devices that opens the native camera:

```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"
  className="hidden"
  ref={cameraInputRef}
  onChange={(e) => handleCameraFile(e.target.files?.[0])}
/>

{/* Two-button row on mobile, single button on desktop */}
<div className="flex flex-col sm:flex-row gap-2">
  <Button onClick={() => cameraInputRef.current?.click()} className="md:hidden">
    <Camera className="h-4 w-4 mr-2" /> Take photo
  </Button>
  <Button onClick={open}>
    <Upload className="h-4 w-4 mr-2" /> Choose file
  </Button>
</div>
```

`handleCameraFile` should run the same compression + upload pipeline as the
dropzone path. Reuse the existing `imageCompression.ts` helper (`src/lib/imageCompression.ts`).

The `capture="environment"` attribute hints the back camera (better for
documents than selfie cam). Some browsers ignore the hint; that's fine.

Test path:
- iOS Safari: Take photo → Camera opens → snap → returns to upload widget
- Android Chrome: same
- Desktop: button is `md:hidden` so doesn't appear

### 3.2 — Touch-target audit

Find every clickable element with a hit area below 44pt and bump it. The
audit found these patterns:

- **Icon buttons inside DocumentUploadWidget** (`h-3 w-3` to `h-3.5 w-3.5`) — wrap with `<button className="h-11 w-11 inline-flex items-center justify-center">` so the icon stays visually small but the hit area is 44pt.
- **`DocumentStatusBadge` text-link** (`text-brand-blue hover:underline`) — give it `inline-block py-2 px-1` and `min-h-[44px]` on mobile via `min-h-[44px] md:min-h-0`.
- **Sidebar `NavItem`** (`py-2 text-sm`) — bump to `py-3` for ≥44pt total height. Apply only inside the mobile drawer if visual rhythm matters on desktop, OR globally if they look fine.

Use this command to find candidates:
```bash
grep -rn "h-3 w-3\|h-3.5 w-3.5\|h-4 w-4" src/components/shared src/components/client | grep -i "button\|<a\|onClick"
```

Don't go on a fishing expedition — fix the wizard surface and DocumentUploadWidget. Anything else can be a follow-up.

### 3.3 — Other client routes

Quick fixes only:

- `src/app/(client)/dashboard/page.tsx` + `DashboardClient.tsx` — verify no
  fixed-width tables or cards that overflow 375px. If there's a `table`
  or grid with hardcoded columns, wrap in `overflow-x-auto` OR collapse
  to a card list at `<md`.
- `src/app/(client)/applications/[id]/page.tsx` — same audit. Pay
  attention to `StatusTimeline` and `ApplicationStatusPanel`.
- `src/app/(client)/services/[id]/page.tsx` — has 0 `md:` prefixes per
  the audit. Verify it's actually mobile-safe by inspection; add prefixes
  to any 2-col grids found.

### 3.4 — Verify Batch 3

- Take a photo on a real phone (or Chrome devtools "Take photo" simulation) → image lands in upload widget → compresses → uploads.
- Tap each formerly-tiny icon button on a touchscreen — easy to hit, no mistaps.
- Dashboard / applications detail / services detail at 375px → no horizontal scroll.

**Commit/push**: `feat: mobile camera capture + touch target fixes`

---

## Batch 4 — KYC fill page (mobile-first)

The KYC invite flow is the page most likely to be opened on a phone — clients
forward links from email/SMS to UBOs/directors. This batch makes sure that
flow works.

### 4.1 — Audit `KycPageClient`

`src/app/(client)/kyc/KycPageClient.tsx` and the `IndividualKycForm` /
`OrganisationKycForm` components it loads. The audit flagged that the step
wizard uses `fixedNav` with `left-[260px]` to align with the desktop sidebar.

Action:
- The `left-[260px]` offset must be `md:left-[260px] left-0` so the fixed
  nav goes full-width on mobile.
- Verify the form fields stack to single column at `<md`.
- The "Verify code" input on the verification step: ensure it's
  `inputMode="numeric"` and `autoComplete="one-time-code"` so iOS/Android
  show the numeric keypad and offer SMS auto-fill.

### 4.2 — Audit `/kyc/fill/[token]` (the unauthenticated invitee path)

This route is what a UBO clicks on from their email — they have no GWMS
account. Find the route file (`src/app/(client)/kyc/fill/[token]/page.tsx`
or similar — check first):

- Should NOT render the client `Sidebar` (it's an unauthenticated guest page). Confirm the layout is correct or that this route uses a different layout.
- Form layout same audit as 4.1.
- The "submit" CTA must be sticky at the bottom of the viewport on mobile so a fat-thumbed user doesn't have to scroll the whole long form to find it.

### 4.3 — Verify Batch 4

- Open `/kyc/fill/[token]` (use a real token from a dev DB row) on a 375px viewport → no sidebar, single-column form, sticky submit.
- Verify code input shows numeric keypad on iOS Safari (use the iOS simulator if available, or rely on Chrome devtools).

**Commit/push**: `fix: KYC fill flow optimized for mobile`

---

## Batch 5 — Verification + docs

### 5.1 — Add a Playwright regression test

Add `tests/e2e/mobile-no-horizontal-scroll.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/apply",
  "/applications/test-app-id",
  "/services/test-service-id",
];

for (const route of ROUTES) {
  test(`no horizontal scroll at 375px on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(route);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
  });
}
```

This won't be in the regular CI run (E2E is label-gated) but it prevents
regressions when someone adds a `grid-cols-2` later.

### 5.2 — Update CHANGES.md

Add a B-052 rollup entry plus per-batch entries (one paragraph each).
Move tech-debt #19 to **Resolved**. Add a new tech-debt entry for "admin
sidebar not yet mobile" if you opted not to touch admin.

### 5.3 — Update CLAUDE.md

In the "Key Gotchas" section, add a one-liner:

> **Mobile-first**: client portal targets 375px minimum. Use `flex-col sm:flex-row` and `grid-cols-1 sm:grid-cols-N` patterns. Sidebar is a drawer below `md:`.

### 5.4 — Final verification

Walk every client route at 375px, 414px, 768px:

1. `/login`, `/register`
2. `/dashboard`
3. `/apply`
4. `/apply/[templateId]/details` → `/documents` → `/review`
5. `/applications/[id]`
6. `/services/[id]`
7. `/kyc`
8. `/kyc/fill/[token]` (unauthenticated)

For each: no horizontal scroll, all touch targets ≥44pt, all forms usable
with the on-screen keyboard. Take screenshots only if something looks off.

Run the full local test suite:
```
npm run lint
npm run build
npm test
```

All green = Batch 5 done.

**Commit/push**: `docs: log B-052 mobile rework + add 375px regression test`

---

## Things to flag to the user (don't surprise them)

- **No DB migrations** in this batch — UI only.
- **`Sheet` component already exists** at `src/components/ui/sheet.tsx`, no new dep.
- **`react-dropzone` already supports the camera path** via the bare `<input type="file" capture>` — no version bump needed.
- **Admin portal not touched** — separate batch later if needed.
- **Auth.js session cookie is unaffected** — the layout refactor only touches client UI shape, not auth.

## Rollback

All work is additive UI. To roll back: `git revert` the batch commits. No
DB or RLS changes.
