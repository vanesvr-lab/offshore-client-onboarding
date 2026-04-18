"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle, Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientServiceDoc } from "@/app/(client)/services/[id]/page";

// Document types that are commonly required for services
// In the real data, required doc types come from due_diligence_requirements
// We show all uploaded documents plus any required ones that are missing.

interface RequiredDocType {
  id: string;
  name: string;
  category: string;
}

interface Props {
  serviceId: string;
  documents: ClientServiceDoc[];
  onDocumentsChange: (docs: ClientServiceDoc[]) => void;
  requiredDocTypes?: RequiredDocType[];
}

function DocRow({
  serviceId,
  docType,
  uploaded,
  onUploaded,
}: {
  serviceId: string;
  docType: RequiredDocType;
  uploaded: ClientServiceDoc | undefined;
  onUploaded: (doc: ClientServiceDoc) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUploaded = !!uploaded;
  const isVerified = uploaded?.verification_status === "verified";
  const isFlagged = uploaded?.verification_status === "flagged" || uploaded?.verification_status === "rejected";

  async function handleFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("documentTypeId", docType.id);

    try {
      const res = await fetch(`/api/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { document?: ClientServiceDoc; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (data.document) {
        onUploaded(data.document as unknown as ClientServiceDoc);
        toast.success(`${docType.name} uploaded`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
      <div className="flex items-center gap-3">
        {isVerified ? (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        ) : isUploaded ? (
          <FileText className="h-4 w-4 text-blue-400 shrink-0" />
        ) : (
          <div className="h-4 w-4 rounded border-2 border-gray-300 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium text-gray-800">{docType.name}</p>
          {uploaded && (
            <p className={`text-xs mt-0.5 ${
              isVerified ? "text-green-600" :
              isFlagged ? "text-amber-600" :
              "text-gray-400"
            }`}>
              {isVerified ? "Verified" :
               isFlagged ? "Flagged for review" :
               "Pending review"}
               {uploaded.file_name && ` · ${uploaded.file_name}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-3 shrink-0">
        {isUploaded && !isFlagged && !isVerified && (
          <span className="text-xs text-blue-500 font-medium">✓ Uploaded</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant={isUploaded ? "outline" : "default"}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={isUploaded ? "text-xs h-7 px-2" : "text-xs h-7 px-3 bg-brand-navy hover:bg-brand-blue"}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isUploaded ? (
            "Replace"
          ) : (
            <><Upload className="h-3 w-3 mr-1" />Upload</>
          )}
        </Button>
      </div>
    </div>
  );
}

export function ServiceWizardDocumentsStep({
  serviceId,
  documents: initialDocuments,
  onDocumentsChange,
  requiredDocTypes: allRequiredDocTypes = [],
}: Props) {
  // Show only corporate/service-level docs — KYC docs (passport, address, etc.) belong in the People step
  const requiredDocTypes = allRequiredDocTypes.filter(
    (dt) => dt.category === "corporate" || dt.category === "compliance" || dt.category === ""
  );

  const [documents, setDocuments] = useState<ClientServiceDoc[]>(
    // Only show non-KYC docs in this step
    initialDocuments.filter((d) => {
      const cat = d.document_types?.category ?? "";
      return cat !== "kyc" && cat !== "identity";
    })
  );

  function handleUploaded(doc: ClientServiceDoc, docTypeId: string) {
    setDocuments((prev) => {
      const next = prev.filter(
        (d) => (d.document_types as unknown as { id?: string } | null)?.id !== docTypeId
      );
      const updated = [...next, doc];
      onDocumentsChange(updated);
      return updated;
    });
  }

  // Build display list: required doc types + any uploaded docs not in required list
  // Find uploaded docs by doc type — match via document_types.name since we might not have ID
  function findUploaded(docType: RequiredDocType): ClientServiceDoc | undefined {
    return documents.find((d) => {
      if (!d.document_types) return false;
      return d.document_types.name === docType.name;
    });
  }

  // Uploaded docs not covered by required list (and not KYC docs)
  const extraUploaded = documents.filter((d) => {
    const cat = d.document_types?.category ?? "";
    if (cat === "kyc" || cat === "identity") return false;
    if (!d.document_types) return true;
    return !requiredDocTypes.some((dt) => dt.name === d.document_types?.name);
  });

  const uploadedCount = documents.length;
  const totalCount = requiredDocTypes.length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Documents</h2>
        <p className="text-sm text-gray-500">
          Upload the required documents for this service. All files must be clear and legible.
        </p>
      </div>

      {requiredDocTypes.length === 0 && documents.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          No required documents specified for this service template.
          Your account manager will request documents as needed.
        </p>
      ) : (
        <div className="space-y-2">
          {requiredDocTypes.map((docType) => (
            <DocRow
              key={docType.id}
              serviceId={serviceId}
              docType={docType}
              uploaded={findUploaded(docType)}
              onUploaded={(doc) => handleUploaded(doc, docType.id)}
            />
          ))}

          {/* Extra uploaded docs not in the required list */}
          {extraUploaded.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 border rounded-lg px-4 py-3 bg-white">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800">{doc.document_types?.name ?? "Document"}</p>
                <p className="text-xs text-gray-400">{doc.file_name}</p>
              </div>
              <span className={`ml-auto text-xs capitalize ${
                doc.verification_status === "verified" ? "text-green-600" :
                doc.verification_status === "flagged" ? "text-amber-600" :
                "text-gray-400"
              }`}>
                {doc.verification_status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Progress summary */}
      {totalCount > 0 && (
        <p className="text-sm text-gray-500 font-medium">
          {Math.min(uploadedCount, totalCount)} of {totalCount} document{totalCount !== 1 ? "s" : ""} uploaded
        </p>
      )}
    </div>
  );
}
