"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { VerificationBadge } from "./VerificationBadge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/utils/constants";
import { normalizeConfidence } from "@/lib/ai/confidence";
import type { DocumentRequirement, DocumentUpload } from "@/types";

interface DocumentUploadStepProps {
  requirement: DocumentRequirement;
  applicationId: string;
  existingUpload: DocumentUpload | null;
  onUploadComplete: (upload: DocumentUpload) => void;
}

export function DocumentUploadStep({
  requirement,
  applicationId,
  existingUpload,
  onUploadComplete,
}: DocumentUploadStepProps) {
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<DocumentUpload | null>(existingUpload);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setUploading(true);

      try {
        // Upload via API route (handles storage + DB using service role)
        const formData = new FormData();
        formData.append("file", file);
        formData.append("applicationId", applicationId);
        formData.append("requirementId", requirement.id);
        if (upload?.id) formData.append("existingUploadId", upload.id);

        const uploadRes = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || uploadJson.error) throw new Error(uploadJson.error || "Upload failed");

        const uploadId: string = uploadJson.uploadId;
        const pendingUpload: DocumentUpload = {
          id: uploadId,
          application_id: applicationId,
          requirement_id: requirement.id,
          file_path: uploadJson.filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          verification_status: "pending",
          verification_result: null,
          admin_override: null,
          admin_override_note: null,
          verified_at: null,
          uploaded_at: new Date().toISOString(),
        };
        setUpload(pendingUpload);

        // Trigger AI verification
        const verifyRes = await fetch("/api/verify-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentUploadId: uploadId,
            applicationId,
            requirementId: requirement.id,
          }),
        });

        const verifyJson = await verifyRes.json();
        if (!verifyRes.ok || verifyJson.error) throw new Error(verifyJson.error || "Verification failed");

        const finalUpload: DocumentUpload = {
          ...pendingUpload,
          verification_status: verifyJson.verificationStatus,
          verification_result: verifyJson.result,
          verified_at: new Date().toISOString(),
        };

        setUpload(finalUpload);
        onUploadComplete(finalUpload);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
      } finally {
        setUploading(false);
      }
    },
    [applicationId, requirement.id, upload, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const requiresCert =
    requirement.verification_rules?.notes?.toLowerCase().includes("certified") ||
    requirement.verification_rules?.notes?.toLowerCase().includes("notarized");

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold text-brand-navy">
            {requirement.name}
          </h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              requirement.category === "corporate"
                ? "bg-blue-100 text-blue-700"
                : requirement.category === "kyc"
                ? "bg-purple-100 text-purple-700"
                : "bg-orange-100 text-orange-700"
            }`}
          >
            {requirement.category.charAt(0).toUpperCase() +
              requirement.category.slice(1)}
          </span>
          {!requirement.is_required && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
              Optional
            </span>
          )}
        </div>
        {requirement.description && (
          <p className="text-sm text-gray-600">{requirement.description}</p>
        )}
        {requiresCert && (
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3" /> This document requires a
            certified or notarized copy
          </p>
        )}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-brand-blue bg-blue-50"
            : "border-gray-300 hover:border-brand-blue hover:bg-gray-50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          {isDragActive
            ? "Drop the file here…"
            : "Drag & drop or click to upload"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 10 MB</p>
      </div>

      {/* State: uploading */}
      {uploading && (
        <div className="flex items-center gap-3 rounded-lg border bg-gray-50 p-4">
          <LoadingSpinner />
          <span className="text-sm text-gray-600">
            Uploading and verifying document with AI…
          </span>
        </div>
      )}

      {/* State: result */}
      {upload && !uploading && (
        <div className="rounded-lg border bg-gray-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium truncate max-w-[220px]">
                {upload.file_name}
              </span>
            </div>
            <VerificationBadge status={upload.verification_status} />
          </div>

          {upload.verification_status === "verified" && (
            <p className="text-sm text-green-700 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Document verified. Key fields
              matched successfully.
            </p>
          )}

          {upload.verification_status === "flagged" &&
            upload.verification_result && (
              <div className="text-sm text-amber-700">
                <p className="font-medium mb-1">Issues found:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  {upload.verification_result.flags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                  {upload.verification_result.match_results
                    .filter((r) => !r.passed)
                    .map((r, i) => (
                      <li key={`mr-${i}`}>
                        {r.note ||
                          `${r.field}: expected "${r.expected}", found "${r.found}"`}
                      </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Upload a corrected document
                  above to re-verify.
                </p>
              </div>
            )}

          {upload.verification_status === "manual_review" && (
            <p className="text-sm text-blue-700 flex items-center gap-1">
              <Info className="h-4 w-4" /> This document has been queued for
              manual review by our team.
            </p>
          )}

          {upload.verification_status === "pending" && (
            <p className="text-sm text-gray-500">Awaiting verification…</p>
          )}

          {upload.verification_result &&
            upload.verification_result.confidence_score > 0 && (
              <p className="text-xs text-gray-400">
                AI confidence: {normalizeConfidence(upload.verification_result.confidence_score)}%
              </p>
            )}
        </div>
      )}
    </div>
  );
}
