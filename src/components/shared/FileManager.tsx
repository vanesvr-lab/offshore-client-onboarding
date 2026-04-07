"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Download, Eye, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { formatDate, formatFileSize } from "@/lib/utils/formatters";
import type { VerificationStatus } from "@/types";

export interface FileEntry {
  id: string;
  file_name: string | null;
  file_size: number | null;
  verification_status: VerificationStatus;
  uploaded_at: string;
  category: string;
  requirementName: string;
  viewHref?: string | null;
}

interface FileManagerProps {
  files: FileEntry[];
  role: "admin" | "client";
  canUpload?: boolean;
  uploadHref?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  corporate: "Corporate Documents",
  kyc: "KYC Documents",
  compliance: "Compliance Documents",
};

async function openDownload(fileId: string) {
  const res = await fetch(`/api/documents/${fileId}/download`);
  const data = await res.json() as { url?: string };
  if (data.url) window.open(data.url, "_blank");
}

export function FileManager({ files, role, canUpload, uploadHref }: FileManagerProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = Array.from(new Set(files.map((f) => f.category)));

  const filtered = files.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (f.file_name ?? "").toLowerCase().includes(q) ||
      f.requirementName.toLowerCase().includes(q);
    const matchCat = categoryFilter === "all" || f.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {categories.length > 1 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:border-brand-navy"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        )}
        {canUpload && uploadHref && (
          <Link href={uploadHref}>
            <Button className="bg-brand-navy hover:bg-brand-blue gap-1.5">
              + Add File
            </Button>
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-white py-14 text-center">
          <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {files.length === 0 ? "No documents uploaded yet" : "No files match your search"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Category</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Uploaded</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Size</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 truncate max-w-[180px]">
                      {file.file_name ?? "Untitled"}
                    </p>
                    <p className="text-xs text-gray-400 truncate max-w-[180px]">
                      {file.requirementName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {CATEGORY_LABELS[file.category] ?? file.category}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(file.uploaded_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatFileSize(file.file_size)}
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge status={file.verification_status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {role === "admin" && file.viewHref && (
                        <Link href={file.viewHref}>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => openDownload(file.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
