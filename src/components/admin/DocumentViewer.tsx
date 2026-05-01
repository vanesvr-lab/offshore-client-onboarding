"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { toast } from "sonner";
import { normalizeConfidence } from "@/lib/ai/confidence";
import type { DocumentUpload, VerificationResult } from "@/types";

interface DocumentViewerProps {
  upload: DocumentUpload;
  signedUrl: string;
}

export function DocumentViewer({ upload, signedUrl }: DocumentViewerProps) {
  const router = useRouter();
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
      const res = await fetch(`/api/admin/documents/${upload.id}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, note: overrideNote || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Override failed");
      }
      toast.success(`Document marked as ${verdict === "pass" ? "verified" : "failed"}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Override failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
      <div className="rounded-lg border bg-white overflow-hidden">
        {upload.mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={upload.file_name || "Document"} className="w-full h-full object-contain" />
        ) : (
          <iframe src={signedUrl} className="w-full h-full" title={upload.file_name || "Document"} />
        )}
      </div>

      <div className="overflow-y-auto space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-brand-navy">Verification Result</CardTitle>
              <VerificationBadge status={upload.verification_status} />
            </div>
          </CardHeader>
          {result ? (
            <CardContent className="space-y-4 text-sm">
              {(() => {
                const conf = normalizeConfidence(result.confidence_score);
                return (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Confidence score</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${conf >= 75 ? "bg-green-500" : conf >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${conf}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{conf}%</span>
                    </div>
                  </div>
                );
              })()}
              {Object.keys(result.extracted_fields).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Extracted fields</p>
                  <dl className="space-y-1">
                    {Object.entries(result.extracted_fields).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-gray-500 capitalize min-w-[120px] text-xs">{k.replace(/_/g, " ")}</dt>
                        <dd className="font-medium text-xs">{v}</dd>
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
                      <li key={idx} className="flex items-start gap-2 text-xs">
                        {r.passed ? <Check className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" /> : <X className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                        <span className={r.passed ? "text-green-700" : "text-red-600"}>
                          {r.note || `${r.field}: expected "${r.expected}", found "${r.found}"`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.flags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Flags</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700 text-xs">
                    {result.flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              <div>
                <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-navy" onClick={() => setShowReasoning(!showReasoning)}>
                  {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  AI reasoning
                </button>
                {showReasoning && (
                  <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2 whitespace-pre-wrap">{result.reasoning}</p>
                )}
              </div>
            </CardContent>
          ) : (
            <CardContent><p className="text-sm text-gray-400">No verification result available.</p></CardContent>
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
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Note <span className="text-gray-400">(required if failing)</span></Label>
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
