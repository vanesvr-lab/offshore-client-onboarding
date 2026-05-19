// B-130 — Client component for the reviewer inbox. Renders a table of
// open review requests and wires the inline "Mark as reviewed" button
// to the existing /api/admin/services/[id]/review-requests/[requestId]
// /close endpoint with reason="reviewer_marked".

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface ReviewsInboxRow {
  id: string;
  service_id: string;
  service_number: string | null;
  template_name: string | null;
  requester_name: string;
  note: string;
  created_at: string;
  section_first: string;
  section_count: number;
  section_full: string[];
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

function preview(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

interface Props {
  rows: ReviewsInboxRow[];
}

export function ReviewsInbox({ rows: initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function markReviewed(row: ReviewsInboxRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(
        `/api/admin/services/${row.service_id}/review-requests/${row.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "reviewer_marked" }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to mark as reviewed");
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Marked as reviewed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white px-8 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500/60 mb-3" />
        <p className="text-sm font-medium text-gray-700">
          You have no pending reviews. Nice.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">
              Requested by
            </th>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">
              Service
            </th>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">
              Sections
            </th>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">
              Note
            </th>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">
              Requested
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-700">{row.requester_name}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/services/${row.service_id}?reviewRequest=${row.id}`}
                  className="text-brand-navy hover:underline"
                >
                  {row.service_number ?? row.service_id.slice(0, 8)}
                </Link>
                {row.template_name && (
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {row.template_name}
                  </span>
                )}
              </td>
              <td
                className="px-4 py-3 text-gray-700"
                title={row.section_full.join("\n")}
              >
                {row.section_first}
                {row.section_count > 1 && (
                  <span className="text-gray-400 ml-1">
                    + {row.section_count - 1}
                  </span>
                )}
              </td>
              <td
                className="px-4 py-3 text-gray-500 max-w-[28ch]"
                title={row.note}
              >
                {preview(row.note)}
              </td>
              <td
                className="px-4 py-3 text-gray-500"
                title={new Date(row.created_at).toLocaleString()}
              >
                {relativeTime(row.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  onClick={() => markReviewed(row)}
                  disabled={busyId === row.id}
                >
                  {busyId === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Mark as reviewed"
                  )}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
