/**
 * B-063 — Compose a form view from server data + optimistic overlay.
 *
 * `serverData` is the source of truth (what's currently in the DB).
 * `overlay` holds user edits that haven't been reconciled yet.
 * The returned object is what the inner steps render.
 */
export function composeFormState<T extends Record<string, unknown>>(
  serverData: T,
  overlay: Partial<T>,
): T {
  return { ...serverData, ...overlay };
}

/**
 * Drop overlay entries whose server value has caught up.
 * Returns a new overlay (or the same reference if nothing changed).
 */
export function reconcileOverlay<T extends Record<string, unknown>>(
  serverData: T,
  overlay: Partial<T>,
): Partial<T> {
  let changed = false;
  const next: Partial<T> = {};
  for (const [key, value] of Object.entries(overlay) as Array<[keyof T, T[keyof T]]>) {
    const serverValue = serverData[key];
    if (serverValue === value) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : overlay;
}
