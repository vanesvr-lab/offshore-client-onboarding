"use client";

// B-097 — flat, filterable, sortable table of every KYC document
// across every profile in this service. One row per (profile × KYC
// doc type) pair so missing required docs surface alongside uploaded
// ones. Status column uses the same `computeDocumentExpiry` helper as
// the per-doc caption so behaviour is identical everywhere.

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, Eye, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { computeDocumentExpiry } from "@/lib/documents/computeExpiry";
import { formatDate } from "@/lib/utils/formatters";
import type { DocumentType, ProfileServiceRole } from "@/types";
import type { ServiceDoc, WaivedDocumentRequirement } from "@/app/(admin)/admin/services/[id]/page";

type RoleWithProfile = ProfileServiceRole & {
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_representative: boolean;
    record_type: string;
    due_diligence_level: string;
    user_id: string | null;
  } | null;
};

type StatusFilter = "all" | "valid" | "expired" | "never_expires" | "missing" | "waived";
type SortKey = "profile" | "doc_type" | "uploaded" | "good_until" | "status";
type SortDir = "asc" | "desc";

interface KycRow {
  key: string;
  profileId: string;
  profileName: string;
  profileRoles: string[];
  docTypeId: string;
  docTypeName: string;
  upload: ServiceDoc | null;
  expiryStatus: "valid" | "expired" | "never_expires" | "missing";
  expiresAt: Date | null;
  // B-100 — waiver row when this requirement has been waived. Renders
  // a muted "Waived" pill in place of the Upload action; the row's
  // Actions cell exposes "Un-waive".
  waiver: WaivedDocumentRequirement | null;
}

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function KycDocumentsTable({
  serviceId,
  docs,
  docTypes,
  roles,
  waivers,
  onWaiversChange,
  onViewClick,
  onUploaded,
}: {
  serviceId: string;
  docs: ServiceDoc[];
  docTypes: DocumentType[];
  roles: RoleWithProfile[];
  /** B-100 — waiver rows for this service. */
  waivers: WaivedDocumentRequirement[];
  /** B-100 — optimistic update callback for Waive / Un-waive. */
  onWaiversChange: (next: WaivedDocumentRequirement[]) => void;
  onViewClick: (docId: string) => void;
  /** Fires after a successful Upload action so the parent can refresh. */
  onUploaded?: () => void;
}) {
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("profile");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{ profileId: string; docTypeId: string; rowKey: string } | null>(null);
  // B-100 — Waive / Un-waive state.
  const [waivingKey, setWaivingKey] = useState<string | null>(null);
  const [waiveConfirm, setWaiveConfirm] =
    useState<{ rowKey: string; profileId: string; docTypeId: string; profileName: string; docTypeName: string } | null>(null);

  // Index waivers by row key for O(1) lookup.
  const waiverByKey = useMemo(() => {
    const m = new Map<string, WaivedDocumentRequirement>();
    for (const w of waivers) {
      m.set(`${w.client_profile_id}-${w.document_type_id}`, w);
    }
    return m;
  }, [waivers]);

  // Unique profiles in this service (deduped by profile id; first match keeps roles).
  const profiles = useMemo(() => {
    const map = new Map<string, { id: string; name: string; roles: string[] }>();
    for (const r of roles) {
      const p = r.client_profiles;
      if (!p) continue;
      const existing = map.get(p.id);
      if (existing) {
        if (!existing.roles.includes(r.role)) existing.roles.push(r.role);
      } else {
        map.set(p.id, { id: p.id, name: p.full_name, roles: [r.role] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [roles]);

  // Build one row per (profile × KYC doc type). When the profile has an
  // applicable upload, use it; else surface the row as `missing`.
  const rows = useMemo<KycRow[]>(() => {
    const now = new Date();
    const result: KycRow[] = [];
    for (const profile of profiles) {
      for (const dt of docTypes) {
        const upload = docs.find(
          (d) =>
            d.client_profile_id === profile.id && d.document_type_id === dt.id,
        );
        const expiry = upload
          ? computeDocumentExpiry(
              { expiry_date: upload.expiry_date, uploaded_at: upload.uploaded_at },
              { valid_for_months: dt.valid_for_months ?? null },
              now,
            )
          : null;
        const expiryStatus: KycRow["expiryStatus"] = upload
          ? expiry!.status
          : "missing";
        const key = `${profile.id}-${dt.id}`;
        result.push({
          key,
          profileId: profile.id,
          profileName: profile.name,
          profileRoles: profile.roles,
          docTypeId: dt.id,
          docTypeName: dt.name,
          upload: upload ?? null,
          expiryStatus,
          expiresAt: expiry?.expiresAt ?? null,
          waiver: waiverByKey.get(key) ?? null,
        });
      }
    }
    return result;
  }, [docs, docTypes, profiles, waiverByKey]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (profileFilter !== "all" && r.profileId !== profileFilter) return false;
      if (docTypeFilter !== "all" && r.docTypeId !== docTypeFilter) return false;
      if (statusFilter === "waived") return r.waiver !== null;
      if (statusFilter !== "all" && r.expiryStatus !== statusFilter) return false;
      return true;
    });
  }, [rows, profileFilter, docTypeFilter, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "profile":
          return a.profileName.localeCompare(b.profileName) * dir;
        case "doc_type":
          return a.docTypeName.localeCompare(b.docTypeName) * dir;
        case "uploaded": {
          const av = a.upload?.uploaded_at ?? "";
          const bv = b.upload?.uploaded_at ?? "";
          return av.localeCompare(bv) * dir;
        }
        case "good_until": {
          const av = a.expiresAt?.getTime() ?? 0;
          const bv = b.expiresAt?.getTime() ?? 0;
          return (av - bv) * dir;
        }
        case "status":
          return a.expiryStatus.localeCompare(b.expiryStatus) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-gray-300" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-gray-500" />
    ) : (
      <ArrowDown className="h-3 w-3 text-gray-500" />
    );
  }

  async function handleUpload(file: File) {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    setUploadingKey(pending.rowKey);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", pending.docTypeId);
      fd.append("clientProfileId", pending.profileId);
      const res = await fetch(
        `/api/admin/services/${serviceId}/documents/upload`,
        { method: "POST", body: fd },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Document uploaded", { position: "top-right" });
      onUploaded?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed", {
        position: "top-right",
      });
    } finally {
      setUploadingKey(null);
      pendingUploadRef.current = null;
    }
  }

  // B-100 — Waive a row. Optimistically inserts a waiver, POSTs to the
  // server; on failure we revert and toast.
  async function waiveRow(row: { rowKey: string; profileId: string; docTypeId: string }) {
    setWaivingKey(row.rowKey);
    const optimistic: WaivedDocumentRequirement = {
      id: `optimistic-${row.profileId}-${row.docTypeId}`,
      client_profile_id: row.profileId,
      document_type_id: row.docTypeId,
      waived_at: new Date().toISOString(),
      waived_by: "",
    };
    const prev = waivers;
    onWaiversChange([...prev.filter((w) => !(w.client_profile_id === row.profileId && w.document_type_id === row.docTypeId)), optimistic]);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/waive-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_profile_id: row.profileId, document_type_id: row.docTypeId }),
      });
      const data = (await res.json()) as { data?: WaivedDocumentRequirement; error?: string };
      if (!res.ok || !data.data) throw new Error(data.error ?? "Waive failed");
      onWaiversChange([...prev.filter((w) => !(w.client_profile_id === row.profileId && w.document_type_id === row.docTypeId)), data.data]);
      toast.success("Document waived", { position: "top-right" });
    } catch (err: unknown) {
      onWaiversChange(prev);
      toast.error(err instanceof Error ? err.message : "Waive failed", { position: "top-right" });
    } finally {
      setWaivingKey(null);
    }
  }

  // B-100 — Un-waive: single-click reversal, no confirm.
  async function unwaiveRow(row: { rowKey: string; profileId: string; docTypeId: string }) {
    setWaivingKey(row.rowKey);
    const prev = waivers;
    onWaiversChange(prev.filter((w) => !(w.client_profile_id === row.profileId && w.document_type_id === row.docTypeId)));
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/waive-document`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_profile_id: row.profileId, document_type_id: row.docTypeId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Un-waive failed");
      toast.success("Document un-waived", { position: "top-right" });
    } catch (err: unknown) {
      onWaiversChange(prev);
      toast.error(err instanceof Error ? err.message : "Un-waive failed", { position: "top-right" });
    } finally {
      setWaivingKey(null);
    }
  }

  function waivedPill(row: KycRow) {
    if (!row.waiver) return null;
    const date = new Date(row.waiver.waived_at).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 italic cursor-help"
                aria-label={`Waived on ${date}`}
              >
                Waived
              </span>
            }
          />
          <TooltipContent>{`Waived on ${date}`}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  function statusBadge(row: KycRow) {
    if (row.waiver) return waivedPill(row);
    if (row.expiryStatus === "missing") {
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
          Missing
        </span>
      );
    }
    if (row.expiryStatus === "expired") {
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
          Expired
        </span>
      );
    }
    if (row.expiryStatus === "never_expires") {
      return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] italic bg-gray-100 text-gray-600">
          Never expires
        </span>
      );
    }
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
        Valid
      </span>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Profile</label>
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1 bg-white"
          >
            <option value="all">All ({profiles.length})</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Doc type</label>
          <select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1 bg-white"
          >
            <option value="all">All ({docTypes.length})</option>
            {docTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-xs border rounded-lg px-2 py-1 bg-white"
          >
            <option value="all">All</option>
            <option value="valid">Valid</option>
            <option value="expired">Expired</option>
            <option value="never_expires">Never expires</option>
            <option value="missing">Missing</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <span className="text-xs text-gray-400 ml-auto">
          {sorted.length} of {rows.length} rows
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("profile")}
                  className="inline-flex items-center gap-1 hover:text-brand-navy"
                >
                  Profile {sortIcon("profile")}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("doc_type")}
                  className="inline-flex items-center gap-1 hover:text-brand-navy"
                >
                  Document type {sortIcon("doc_type")}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">Filename</th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("uploaded")}
                  className="inline-flex items-center gap-1 hover:text-brand-navy"
                >
                  Uploaded {sortIcon("uploaded")}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("good_until")}
                  className="inline-flex items-center gap-1 hover:text-brand-navy"
                >
                  Good until {sortIcon("good_until")}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("status")}
                  className="inline-flex items-center gap-1 hover:text-brand-navy"
                >
                  Status {sortIcon("status")}
                </button>
              </th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                  No documents match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{row.profileName}</span>
                      <span className="text-[10px] text-gray-500">
                        {row.profileRoles.map(roleLabel).join(" · ")}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-700">{row.docTypeName}</td>
                  <td className="px-3 py-2 align-top text-gray-600 truncate max-w-[18ch]">
                    {row.upload?.file_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600">
                    {row.upload ? formatDate(row.upload.uploaded_at) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600">
                    {row.expiresAt ? formatDate(row.expiresAt.toISOString()) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      {statusBadge(row)}
                      {row.upload && (
                        <DocumentStatusBadge
                          aiStatus={row.upload.verification_status}
                          adminStatus={row.upload.admin_status}
                          compact
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {row.upload ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => row.upload && onViewClick(row.upload.id)}
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                      ) : row.waiver ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1"
                          disabled={uploadingKey === row.key}
                          onClick={() => {
                            pendingUploadRef.current = {
                              profileId: row.profileId,
                              docTypeId: row.docTypeId,
                              rowKey: row.key,
                            };
                            uploadInputRef.current?.click();
                          }}
                        >
                          {uploadingKey === row.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3" />
                          )}
                          Upload
                        </Button>
                      )}
                      {/* B-100 — Waive / Un-waive. Available on every row;
                          the muted "Waived" pill in the Status column
                          carries the visible state. */}
                      {row.waiver ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-brand-navy"
                          disabled={waivingKey === row.key}
                          onClick={() =>
                            void unwaiveRow({ rowKey: row.key, profileId: row.profileId, docTypeId: row.docTypeId })
                          }
                        >
                          {waivingKey === row.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Un-waive
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-brand-navy"
                          disabled={waivingKey === row.key}
                          onClick={() =>
                            setWaiveConfirm({
                              rowKey: row.key,
                              profileId: row.profileId,
                              docTypeId: row.docTypeId,
                              profileName: row.profileName,
                              docTypeName: row.docTypeName,
                            })
                          }
                        >
                          {waivingKey === row.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Ban className="h-3 w-3" />
                          )}
                          Waive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = "";
        }}
      />

      {/* B-100 — Waive confirmation dialog. No reason field (Vanessa
          explicitly said "just a modal"). Single-click Un-waive is the
          reversal path so no confirm there. */}
      <Dialog
        open={waiveConfirm !== null}
        onOpenChange={(o) => {
          if (!o) setWaiveConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive this document?</DialogTitle>
          </DialogHeader>
          {waiveConfirm && (
            <p className="text-sm text-gray-600">
              The client will no longer be asked to upload{" "}
              <span className="font-semibold">{waiveConfirm.docTypeName}</span>{" "}
              for{" "}
              <span className="font-semibold">{waiveConfirm.profileName}</span>.
              You can un-waive it at any time.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaiveConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="bg-brand-navy hover:bg-brand-navy/90 text-white"
              onClick={() => {
                if (!waiveConfirm) return;
                const target = waiveConfirm;
                setWaiveConfirm(null);
                void waiveRow({
                  rowKey: target.rowKey,
                  profileId: target.profileId,
                  docTypeId: target.docTypeId,
                });
              }}
            >
              Waive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
