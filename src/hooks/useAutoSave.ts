"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export function useAutoSave(
  kycRecordId: string,
  fields: Record<string, unknown>,
  debounceMs: number = 500
): { saving: boolean; lastSaved: Date | null; error: string | null } {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    // Skip the initial mount
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (!kycRecordId) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/kyc/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kycRecordId, fields }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        setLastSaved(new Date());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setError(msg);
        toast.error(`Auto-save failed: ${msg}`);
      } finally {
        setSaving(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  return { saving, lastSaved, error };
}
