import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, User, Building2, AlertTriangle, CheckCircle } from "lucide-react";
import type { KycRecord } from "@/types";

interface KycSummaryCardProps {
  clientId: string;
  records: KycRecord[];
}

const REQUIRED_INDIVIDUAL = [
  "full_name", "email", "date_of_birth", "nationality", "passport_number",
  "passport_expiry", "address", "occupation", "source_of_funds_description",
];
const REQUIRED_ORG = [
  "full_name", "email", "address", "jurisdiction_incorporated",
  "date_of_incorporation", "listed_or_unlisted", "description_activity",
];

function countCompletion(record: KycRecord): { filled: number; total: number } {
  const required = record.record_type === "individual" ? REQUIRED_INDIVIDUAL : REQUIRED_ORG;
  const filled = required.filter((f) => {
    const v = (record as unknown as Record<string, unknown>)[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return { filled, total: required.length };
}

function riskBadge(rating: KycRecord["risk_rating"]) {
  if (!rating) return <span className="text-xs text-gray-400">Not rated</span>;
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    prohibited: "bg-red-100 text-red-800",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${colors[rating] ?? "bg-gray-100 text-gray-600"}`}>
      {rating}
    </span>
  );
}

export function KycSummaryCard({ clientId, records }: KycSummaryCardProps) {
  if (records.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-brand-navy">KYC Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">No KYC records found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-brand-navy">KYC Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {records.map((record) => {
          const { filled, total } = countCompletion(record);
          const complete = filled === total;
          return (
            <div key={record.id} className="rounded-lg border px-3 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {record.record_type === "individual" ? (
                    <User className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Building2 className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-brand-navy">
                    {record.full_name ?? (record.record_type === "individual" ? "Individual" : "Organisation")}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">
                    {record.record_type}
                  </span>
                </div>
                <Link href={`/admin/clients/${clientId}/kyc`}>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    View / Edit KYC
                  </Button>
                </Link>
              </div>

              {/* Completion bar */}
              <div className="flex items-center gap-2">
                {complete ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                )}
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-accent rounded-full transition-all"
                    style={{ width: `${Math.round((filled / total) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 shrink-0">{filled}/{total} fields</span>
              </div>

              {/* Risk indicators */}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {riskBadge(record.risk_rating)}
                </div>
                {record.is_pep && (
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-medium">PEP</span>
                )}
                {record.sanctions_checked && (
                  <span className="text-green-600 text-[10px]">✓ Sanctions</span>
                )}
                {record.adverse_media_checked && (
                  <span className="text-green-600 text-[10px]">✓ Media</span>
                )}
              </div>
            </div>
          );
        })}

        <Link href={`/admin/clients/${clientId}/risk`}>
          <Button variant="outline" size="sm" className="w-full text-xs mt-1">
            Open Risk Assessment
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
