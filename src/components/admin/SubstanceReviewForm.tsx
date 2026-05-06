"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ConnectedSectionHeader,
  ConnectedNotesHistory,
} from "./AdminApplicationSections";
import type { ServiceSubstance, SubstanceAssessment } from "@/types";

// B-072 Batch 4 — FSC §3.2/§3.3/§3.4 substance review form. Admin-only.
// Section-review trail uses the B-068/B-073 plumbing under section_key
// `action:substance_review`. The form body GET/PUTs to the new
// `/api/admin/services/[id]/substance` endpoint.

const SECTION_KEY = "action:substance_review";

type Tri = boolean | null; // null = unanswered

interface FormState {
  // §3.2
  has_two_mu_resident_directors: Tri;
  principal_bank_account_in_mu: Tri;
  accounting_records_in_mu: Tri;
  audited_in_mu: Tri;
  board_meetings_with_mu_quorum: Tri;
  cis_administered_from_mu: Tri;
  // §3.3
  has_office_premises_in_mu: Tri;
  office_address: string;
  has_full_time_mu_employee: Tri;
  employee_count: string; // numeric input as string for empty-handling
  arbitration_clause_in_mu: Tri;
  arbitration_clause_text: string;
  holds_mu_assets_above_100k_usd: Tri;
  mu_assets_value_usd: string;
  mu_assets_description: string;
  shares_listed_on_mu_exchange: Tri;
  exchange_listing_reference: string;
  has_reasonable_mu_expenditure: Tri;
  yearly_mu_expenditure_usd: string;
  expenditure_justification: string;
  // §3.4
  related_corp_satisfies_3_3: Tri;
  related_corp_name: string;
  // assessment
  admin_assessment: SubstanceAssessment | null;
  admin_assessment_notes: string;
}

const EMPTY_STATE: FormState = {
  has_two_mu_resident_directors: null,
  principal_bank_account_in_mu: null,
  accounting_records_in_mu: null,
  audited_in_mu: null,
  board_meetings_with_mu_quorum: null,
  cis_administered_from_mu: null,
  has_office_premises_in_mu: null,
  office_address: "",
  has_full_time_mu_employee: null,
  employee_count: "",
  arbitration_clause_in_mu: null,
  arbitration_clause_text: "",
  holds_mu_assets_above_100k_usd: null,
  mu_assets_value_usd: "",
  mu_assets_description: "",
  shares_listed_on_mu_exchange: null,
  exchange_listing_reference: "",
  has_reasonable_mu_expenditure: null,
  yearly_mu_expenditure_usd: "",
  expenditure_justification: "",
  related_corp_satisfies_3_3: null,
  related_corp_name: "",
  admin_assessment: null,
  admin_assessment_notes: "",
};

function fromServer(row: ServiceSubstance | null): FormState {
  if (!row) return EMPTY_STATE;
  return {
    has_two_mu_resident_directors: row.has_two_mu_resident_directors,
    principal_bank_account_in_mu: row.principal_bank_account_in_mu,
    accounting_records_in_mu: row.accounting_records_in_mu,
    audited_in_mu: row.audited_in_mu,
    board_meetings_with_mu_quorum: row.board_meetings_with_mu_quorum,
    cis_administered_from_mu: row.cis_administered_from_mu,
    has_office_premises_in_mu: row.has_office_premises_in_mu,
    office_address: row.office_address ?? "",
    has_full_time_mu_employee: row.has_full_time_mu_employee,
    employee_count: row.employee_count == null ? "" : String(row.employee_count),
    arbitration_clause_in_mu: row.arbitration_clause_in_mu,
    arbitration_clause_text: row.arbitration_clause_text ?? "",
    holds_mu_assets_above_100k_usd: row.holds_mu_assets_above_100k_usd,
    mu_assets_value_usd: row.mu_assets_value_usd == null ? "" : String(row.mu_assets_value_usd),
    mu_assets_description: row.mu_assets_description ?? "",
    shares_listed_on_mu_exchange: row.shares_listed_on_mu_exchange,
    exchange_listing_reference: row.exchange_listing_reference ?? "",
    has_reasonable_mu_expenditure: row.has_reasonable_mu_expenditure,
    yearly_mu_expenditure_usd: row.yearly_mu_expenditure_usd == null ? "" : String(row.yearly_mu_expenditure_usd),
    expenditure_justification: row.expenditure_justification ?? "",
    related_corp_satisfies_3_3: row.related_corp_satisfies_3_3,
    related_corp_name: row.related_corp_name ?? "",
    admin_assessment: row.admin_assessment,
    admin_assessment_notes: row.admin_assessment_notes ?? "",
  };
}

function toPayload(state: FormState): Record<string, unknown> {
  const numOrNull = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const txtOrNull = (s: string): string | null => (s.trim() ? s : null);
  return {
    has_two_mu_resident_directors: state.has_two_mu_resident_directors,
    principal_bank_account_in_mu: state.principal_bank_account_in_mu,
    accounting_records_in_mu: state.accounting_records_in_mu,
    audited_in_mu: state.audited_in_mu,
    board_meetings_with_mu_quorum: state.board_meetings_with_mu_quorum,
    cis_administered_from_mu: state.cis_administered_from_mu,
    has_office_premises_in_mu: state.has_office_premises_in_mu,
    office_address: txtOrNull(state.office_address),
    has_full_time_mu_employee: state.has_full_time_mu_employee,
    employee_count: intOrNull(state.employee_count),
    arbitration_clause_in_mu: state.arbitration_clause_in_mu,
    arbitration_clause_text: txtOrNull(state.arbitration_clause_text),
    holds_mu_assets_above_100k_usd: state.holds_mu_assets_above_100k_usd,
    mu_assets_value_usd: numOrNull(state.mu_assets_value_usd),
    mu_assets_description: txtOrNull(state.mu_assets_description),
    shares_listed_on_mu_exchange: state.shares_listed_on_mu_exchange,
    exchange_listing_reference: txtOrNull(state.exchange_listing_reference),
    has_reasonable_mu_expenditure: state.has_reasonable_mu_expenditure,
    yearly_mu_expenditure_usd: numOrNull(state.yearly_mu_expenditure_usd),
    expenditure_justification: txtOrNull(state.expenditure_justification),
    related_corp_satisfies_3_3: state.related_corp_satisfies_3_3,
    related_corp_name: txtOrNull(state.related_corp_name),
    admin_assessment: state.admin_assessment,
    admin_assessment_notes: txtOrNull(state.admin_assessment_notes),
  };
}

const TRI_OPTIONS: { label: string; value: Tri }[] = [
  { label: "Yes", value: true },
  { label: "No", value: false },
  { label: "Unknown", value: null },
];

function TriRadio({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  return (
    <div className="flex items-center gap-3" role="radiogroup">
      {TRI_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <label
            key={String(opt.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-brand-blue bg-brand-blue/10 text-brand-navy font-medium"
                : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 sm:flex-1">
        <p className="text-sm text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const ASSESSMENT_OPTIONS: {
  value: SubstanceAssessment;
  label: string;
  Icon: typeof CheckCircle2;
  active: string;
  iconColor: string;
}[] = [
  { value: "pass",   label: "Pass",   Icon: CheckCircle2,  active: "border-green-500 bg-green-50 text-green-800",  iconColor: "text-green-600" },
  { value: "review", label: "Review", Icon: AlertTriangle, active: "border-amber-500 bg-amber-50 text-amber-800",  iconColor: "text-amber-600" },
  { value: "fail",   label: "Fail",   Icon: XCircle,        active: "border-red-500 bg-red-50 text-red-800",        iconColor: "text-red-600" },
];

export function SubstanceReviewForm({
  serviceId,
  serviceLabel,
  initialSubstance,
}: {
  serviceId: string;
  serviceLabel: string;
  // B-072 Batch 6 — when provided, skips the GET /substance fetch on mount.
  // The page already loads this server-side so the form renders prefilled.
  initialSubstance?: ServiceSubstance | null;
}) {
  const [state, setState] = useState<FormState>(() =>
    initialSubstance !== undefined ? fromServer(initialSubstance) : EMPTY_STATE,
  );
  const [loading, setLoading] = useState(initialSubstance === undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSubstance !== undefined) return;
    let cancelled = false;
    fetch(`/api/admin/services/${serviceId}/substance`)
      .then((r) => r.json())
      .then((json: { data?: ServiceSubstance | null; error?: string }) => {
        if (cancelled) return;
        if (json.error) {
          toast.error(json.error);
        } else {
          setState(fromServer(json.data ?? null));
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Failed to load substance");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, initialSubstance]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const notesRequired =
    state.admin_assessment === "fail" || state.admin_assessment === "review";
  const canSave =
    !saving && (!notesRequired || state.admin_assessment_notes.trim().length > 0);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/substance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(state)),
      });
      const json = (await res.json()) as { data?: ServiceSubstance; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "Save failed");
      }
      setState(fromServer(json.data));
      toast.success("Substance review saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <ConnectedSectionHeader
        title={`Substance Review — ${serviceLabel}`}
        sectionKey={SECTION_KEY}
      />
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading substance review…</p>
        ) : (
          <>
            <Section title="§3.2 — Mandatory Criteria" subtitle="All must be Yes for the service to satisfy §3.2.">
              <FieldRow label="Has 2 Mauritius-resident directors?">
                <TriRadio name="r1" value={state.has_two_mu_resident_directors} onChange={(v) => setField("has_two_mu_resident_directors", v)} />
              </FieldRow>
              <FieldRow label="Principal bank account in Mauritius?">
                <TriRadio name="r2" value={state.principal_bank_account_in_mu} onChange={(v) => setField("principal_bank_account_in_mu", v)} />
              </FieldRow>
              <FieldRow label="Accounting records kept in Mauritius?">
                <TriRadio name="r3" value={state.accounting_records_in_mu} onChange={(v) => setField("accounting_records_in_mu", v)} />
              </FieldRow>
              <FieldRow label="Audited in Mauritius?">
                <TriRadio name="r4" value={state.audited_in_mu} onChange={(v) => setField("audited_in_mu", v)} />
              </FieldRow>
              <FieldRow label="Board meetings with Mauritius quorum?">
                <TriRadio name="r5" value={state.board_meetings_with_mu_quorum} onChange={(v) => setField("board_meetings_with_mu_quorum", v)} />
              </FieldRow>
              <FieldRow label="CIS administered from Mauritius?" hint="Only relevant for Collective Investment Schemes — leave Unknown if N/A.">
                <TriRadio name="r6" value={state.cis_administered_from_mu} onChange={(v) => setField("cis_administered_from_mu", v)} />
              </FieldRow>
            </Section>

            <Section title="§3.3 — At-Least-One Criteria" subtitle="At least one criterion must be Yes with supporting evidence.">
              <Conditional
                label="Office premises in Mauritius?"
                value={state.has_office_premises_in_mu}
                onChange={(v) => setField("has_office_premises_in_mu", v)}
                evidence={
                  <Input
                    placeholder="Office address"
                    value={state.office_address}
                    onChange={(e) => setField("office_address", e.target.value)}
                  />
                }
              />
              <Conditional
                label="Full-time Mauritius employee?"
                value={state.has_full_time_mu_employee}
                onChange={(v) => setField("has_full_time_mu_employee", v)}
                evidence={
                  <Input
                    type="number"
                    min={0}
                    placeholder="Employee count"
                    value={state.employee_count}
                    onChange={(e) => setField("employee_count", e.target.value)}
                  />
                }
              />
              <Conditional
                label="Arbitration clause specifying Mauritius?"
                value={state.arbitration_clause_in_mu}
                onChange={(v) => setField("arbitration_clause_in_mu", v)}
                evidence={
                  <Textarea
                    rows={2}
                    placeholder="Arbitration clause text"
                    value={state.arbitration_clause_text}
                    onChange={(e) => setField("arbitration_clause_text", e.target.value)}
                  />
                }
              />
              <Conditional
                label="MU assets > USD 100,000?"
                value={state.holds_mu_assets_above_100k_usd}
                onChange={(v) => setField("holds_mu_assets_above_100k_usd", v)}
                evidence={
                  <div className="space-y-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Asset value (USD)"
                      value={state.mu_assets_value_usd}
                      onChange={(e) => setField("mu_assets_value_usd", e.target.value)}
                    />
                    <Textarea
                      rows={2}
                      placeholder="Asset description"
                      value={state.mu_assets_description}
                      onChange={(e) => setField("mu_assets_description", e.target.value)}
                    />
                  </div>
                }
              />
              <Conditional
                label="Listed on a Mauritius exchange?"
                value={state.shares_listed_on_mu_exchange}
                onChange={(v) => setField("shares_listed_on_mu_exchange", v)}
                evidence={
                  <Input
                    placeholder="Exchange + listing reference"
                    value={state.exchange_listing_reference}
                    onChange={(e) => setField("exchange_listing_reference", e.target.value)}
                  />
                }
              />
              <Conditional
                label="Reasonable Mauritius expenditure?"
                value={state.has_reasonable_mu_expenditure}
                onChange={(v) => setField("has_reasonable_mu_expenditure", v)}
                evidence={
                  <div className="space-y-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Yearly expenditure (USD)"
                      value={state.yearly_mu_expenditure_usd}
                      onChange={(e) => setField("yearly_mu_expenditure_usd", e.target.value)}
                    />
                    <Textarea
                      rows={2}
                      placeholder="Justification"
                      value={state.expenditure_justification}
                      onChange={(e) => setField("expenditure_justification", e.target.value)}
                    />
                  </div>
                }
              />
            </Section>

            <Section title="§3.4 — Fallback" subtitle="If §3.3 isn't satisfied directly, a related corporation may satisfy it.">
              <Conditional
                label="Related corporation satisfies §3.3?"
                value={state.related_corp_satisfies_3_3}
                onChange={(v) => setField("related_corp_satisfies_3_3", v)}
                evidence={
                  <Input
                    placeholder="Related corporation name"
                    value={state.related_corp_name}
                    onChange={(e) => setField("related_corp_name", e.target.value)}
                  />
                }
              />
            </Section>

            <Section title="Admin Assessment" subtitle="Pass = OK. Review = needs follow-up. Fail = does not meet requirements. Notes required for Review or Fail.">
              <div className="grid grid-cols-3 gap-2">
                {ASSESSMENT_OPTIONS.map((opt) => {
                  const active = state.admin_assessment === opt.value;
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setField(
                          "admin_assessment",
                          state.admin_assessment === opt.value ? null : opt.value,
                        )
                      }
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors",
                        active
                          ? opt.active
                          : "border-gray-200 text-gray-600 hover:bg-gray-50",
                      )}
                    >
                      <Icon className={cn("size-4", opt.iconColor)} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Notes
                  {notesRequired ? (
                    <span className="ml-1 text-red-600">*</span>
                  ) : (
                    <span className="ml-1 text-gray-400">(optional)</span>
                  )}
                </label>
                <Textarea
                  rows={3}
                  value={state.admin_assessment_notes}
                  onChange={(e) => setField("admin_assessment_notes", e.target.value)}
                  placeholder={
                    notesRequired
                      ? "Required: explain what needs to change…"
                      : "Optional context for this assessment…"
                  }
                />
              </div>
            </Section>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSave}
                className="bg-brand-navy hover:bg-brand-blue"
              >
                {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                Save substance review
              </Button>
            </div>
          </>
        )}
        <ConnectedNotesHistory sectionKey={SECTION_KEY} />
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="space-y-3 rounded-lg border bg-gray-50/40 px-4 py-3">
        {children}
      </div>
    </section>
  );
}

function Conditional({
  label,
  value,
  onChange,
  evidence,
}: {
  label: string;
  value: Tri;
  onChange: (v: Tri) => void;
  evidence: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldRow label={label}>
        <TriRadio name={label} value={value} onChange={onChange} />
      </FieldRow>
      {value === true && (
        <div className="ml-0 sm:ml-4 border-l-2 border-brand-blue/30 pl-3">{evidence}</div>
      )}
    </div>
  );
}
