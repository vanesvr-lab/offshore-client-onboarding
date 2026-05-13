# CLI Brief — B-103 Header Avatar + Right-Rail Height Cap

**Status:** Hold until B-102 lands
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-101 batch 4 (admin avatar upload), B-101 batch 5 (header chrome)

---

## Hold rule

Do not start B-103 until commit `feat: …Review Wizard…` (B-102) is on `origin/main`. B-103 touches `ServiceDetailClient.tsx`; B-102 also touches it (entry button + `reviewMode` props). Run `git pull origin main` and `git log --oneline -8` first — must see the B-102 feat commit.

---

## Why this batch exists

Two small UX gaps surfaced after B-101:

1. **Admin avatar isn't visible at the top of the page.** B-101 batch 4 wired the avatar into the sidebar footer only. Sidebar footer requires scrolling to find on shorter viewports (compounded by the right-rail empty-space issue below). Admin wants the avatar in the **top Header** alongside their name, same as the client variant already gets.
2. **Big empty space below the left column on `/admin/services/[id]`.** The right rail is `lg:sticky lg:top-[300px] lg:max-h-[calc(100vh-320px)]`. When the left column's natural height is shorter than `(100vh - 320px)` (e.g. all form sections collapsed, only Internal Notes + Risk Assessment visible), the sticky right rail stretches the page beyond the left's bottom, leaving a large white area on the left below Risk Assessment. Vanessa picked option (b): cap the right rail's max height to the left column's natural height so both columns end at the same scroll position.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No new API routes, no migrations.** Pure UI.
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Step 1 — Avatar in the Header

File: [`src/components/shared/Header.tsx`](src/components/shared/Header.tsx).

Today, `HeaderProps` is `{ userName?, variant?, onOpenMobileNav? }`. The client variant renders a blue initials circle + name; the admin variant renders just the name as text. Both should render the same avatar treatment, using a real image when `avatarUrl` exists.

Changes:

```ts
interface HeaderProps {
  userName?: string | null;
  avatarUrl?: string | null;        // ← new
  variant?: "admin" | "client";
  onOpenMobileNav?: () => void;
}
```

In the right-side block, replace the variant-split avatar/text render with a single unified block:

```tsx
{userName && (
  <div className="flex items-center gap-2">
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-blue-500 flex items-center justify-center">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={userName}
          width={32}
          height={32}
          className="h-8 w-8 object-cover"
          unoptimized
        />
      ) : (
        <span className="text-white text-xs font-semibold">{getInitials(userName)}</span>
      )}
    </div>
    <span className="text-white text-sm hidden sm:inline">{userName}</span>
  </div>
)}
```

Import `Image` from `next/image`. Drop the variant-specific branching for the right block — both admin and client get the same treatment now.

Pass `avatarUrl` through from both layouts:

- [`src/app/(admin)/layout.tsx`](src/app/(admin)/layout.tsx): the layout already fetches `avatar_url` for the Sidebar (line 20). Pass it to `<Header userName={userName} avatarUrl={avatarUrl} />` as well.
- [`src/app/(client)/layout.tsx`](src/app/(client)/layout.tsx): add the same fetch (mirror the admin layout's pattern — read `users.avatar_url` by `session.user.id`) and pass to Header.

Tech debt note: clients can't upload an avatar yet (B-101 deferred the `/account` mirror to tech-debt). That's fine — `avatarUrl` will be `null` for clients today and the initials fallback renders. The hookup is forward-compatible for when client-side avatar upload ships.

---

## Step 2 — Right-rail height cap (option b)

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) around lines 3617–3948.

**Approach:** measure the left column's rendered height with a `ResizeObserver`; cap the right rail's `max-height` to that value.

### 2.1 — Add refs + state at the page-root component

Inside `ServiceDetailClient`, near the top of the component body:

```ts
const leftColumnRef = useRef<HTMLDivElement>(null);
const [railMaxHeight, setRailMaxHeight] = useState<number | null>(null);

useEffect(() => {
  const el = leftColumnRef.current;
  if (!el) return;
  // Honour the original "viewport minus header" cap as a ceiling — if the
  // left column ever exceeds viewport, sticky behaviour falls back to that.
  const ceiling = () => window.innerHeight - 320;
  const observer = new ResizeObserver(([entry]) => {
    setRailMaxHeight(Math.min(entry.contentRect.height, ceiling()));
  });
  observer.observe(el);
  window.addEventListener("resize", () => setRailMaxHeight((cur) => {
    if (cur === null || !el) return cur;
    return Math.min(el.getBoundingClientRect().height, ceiling());
  }));
  return () => observer.disconnect();
}, []);
```

### 2.2 — Attach the ref + style

On the left column wrapper (around line 3621):

```tsx
<div ref={leftColumnRef} className="lg:col-span-2 space-y-4">
```

On the right rail wrapper (around line 3948), replace the existing classes' `lg:max-h-[calc(100vh-320px)]` with an inline style so the dynamic value wins, and keep the rest:

```tsx
<div
  className="lg:sticky lg:top-[300px] lg:self-start lg:overflow-y-auto space-y-3"
  style={railMaxHeight ? { maxHeight: railMaxHeight } : undefined}
>
```

This means:
- On mount, `railMaxHeight` is `null` → no inline cap → the rail uses its natural height (no Tailwind cap either since we removed `lg:max-h-…`). For one frame the page may render with rail-as-tall-as-content; the observer fires immediately on layout and the cap kicks in.
- On every left-column height change (section expand/collapse, profile add/remove, etc.) the observer fires and the rail re-caps.
- On window resize, the ceiling is recomputed so the rail never exceeds viewport height even if the left is somehow very tall.

### 2.3 — Behaviour verification

Test cases:

1. **All form sections collapsed (the screenshot scenario)** — left is short (Internal Notes + Risk Assessment cards). Right rail should now also be short, ending at the same scroll position as the left.
2. **All form sections expanded + many profiles** — left is tall (overflows viewport). Right rail should remain capped at viewport height (the ceiling), staying sticky as you scroll.
3. **Toggle a section open/closed** — the rail height should adjust within ~16ms (one observer fire), no flash.

---

## Step 3 — Commit + push + CHANGES.md

```
feat: avatar in top header + right-rail height matches left column
```

CHANGES.md under `## B-103`:

```
## B-103 — Header avatar + right-rail height cap (done <date>)

- `src/components/shared/Header.tsx`: unified avatar treatment for admin + client variants;
  renders `<Image>` when `avatarUrl` is set, falls back to initials otherwise. New
  `avatarUrl` prop threaded from `(admin)/layout.tsx` (existing fetch) and
  `(client)/layout.tsx` (new fetch).
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`: `ResizeObserver` on the
  left column drives the right rail's `max-height` so both columns end at the same
  scroll position, eliminating the empty space below short left content. Viewport
  height (`100vh - 320px`) remains the upper ceiling.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] On any admin page, top header shows admin's avatar (uploaded photo) immediately left of the name; falls back to initials circle when `avatar_url` is null
- [ ] On any client page, top header shows initials circle (client avatar upload comes later)
- [ ] On `/admin/services/[id]` with most sections collapsed: no large empty white area below the left column — the right rail and left column end at the same scroll position
- [ ] On `/admin/services/[id]` with all sections expanded: right rail stays sticky as you scroll, capped at viewport height
- [ ] Toggling a section open or closed re-balances the rail height within one render frame
- [ ] CHANGES.md has a single B-103 entry

---

## After the batch

Final commit + push + CHANGES.md → tell Vanessa: "B-103 done — avatar in header + right-rail balanced." Stop.
