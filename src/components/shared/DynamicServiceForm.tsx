"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldTooltip } from "@/components/shared/FieldTooltip";
import { MultiSelectCountry } from "@/components/shared/MultiSelectCountry";

/** Field definition from service_templates.service_fields */
export interface ServiceField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "boolean" | "text_array" | "date" | "number" | "multi_select_country";
  section?: string;
  required?: boolean;
  placeholder?: string;
  note?: string;
  options?: string[];
  max?: number; // for text_array
  show_if?: Record<string, unknown>; // conditional visibility
  tooltip?: string; // help text shown in clickable tooltip
}

interface DynamicServiceFormProps {
  fields: ServiceField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

/**
 * Renders a dynamic form based on field definitions from the service template.
 * Groups fields by section. Handles conditional visibility via show_if.
 * No code change needed for new service types — just add field definitions to the template.
 */
export function DynamicServiceForm({
  fields,
  values,
  onChange,
  readOnly = false,
}: DynamicServiceFormProps) {
  if (!fields || fields.length === 0) return null;

  // Check if a field should be visible based on show_if conditions
  function isVisible(field: ServiceField): boolean {
    if (!field.show_if) return true;
    return Object.entries(field.show_if).every(
      ([k, v]) => values[k] === v
    );
  }

  // Group fields by section
  const sections: Record<string, ServiceField[]> = {};
  for (const f of fields) {
    const sec = f.section || "Details";
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(f);
  }

  function renderField(field: ServiceField) {
    if (!isVisible(field)) return null;

    const val = values[field.key];

    switch (field.type) {
      case "text":
      case "date":
      case "number":
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && " *"}
              {field.note && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-2">
                  {field.note}
                </span>
              )}
              {field.tooltip && <FieldTooltip content={field.tooltip} />}
            </Label>
            <Input
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              value={(val as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              readOnly={readOnly}
            />
          </div>
        );

      case "textarea":
        return (
          <div key={field.key} className="col-span-2 space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && " *"}
              {field.tooltip && <FieldTooltip content={field.tooltip} />}
            </Label>
            <Textarea
              value={(val as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              rows={3}
              placeholder={field.placeholder}
              readOnly={readOnly}
            />
          </div>
        );

      case "select": {
        const isOther = (val as string) === "Other";
        const otherKey = `${field.key}_other`;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && " *"}
              {field.tooltip && <FieldTooltip content={field.tooltip} />}
            </Label>
            <Select
              value={(val as string) ?? ""}
              onValueChange={(v) => onChange(field.key, v ?? "")}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${field.label.toLowerCase()}…`} />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOther && !readOnly && (
              <Input
                placeholder="Please specify…"
                value={(values[otherKey] as string) ?? ""}
                onChange={(e) => onChange(otherKey, e.target.value)}
                className="mt-1"
              />
            )}
            {isOther && readOnly && (values[otherKey] as string) && (
              <p className="text-sm text-gray-700 mt-1">{values[otherKey] as string}</p>
            )}
          </div>
        );
      }

      case "boolean":
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && " *"}
              {field.note && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-2">
                  {field.note}
                </span>
              )}
              {field.tooltip && <FieldTooltip content={field.tooltip} />}
            </Label>
            <Select
              value={val === true ? "yes" : val === false ? "no" : ""}
              onValueChange={(v) => onChange(field.key, v === "yes")}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "text_array": {
        const arr = (Array.isArray(val) ? val : []) as string[];
        const max = field.max ?? 3;
        // Pad to max length
        const padded = [...arr, ...Array(Math.max(0, max - arr.length)).fill("")].slice(0, max);
        return (
          <div key={field.key} className="col-span-2 space-y-1.5">
            <Label className="text-sm">
              {field.label}
              {field.required && " *"}
            </Label>
            <div className="space-y-2">
              {padded.map((v: string, i: number) => (
                <Input
                  key={i}
                  placeholder={`Option ${i + 1}`}
                  value={v}
                  onChange={(e) => {
                    const next = [...padded];
                    next[i] = e.target.value;
                    onChange(field.key, next);
                  }}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        );
      }

      case "multi_select_country": {
        const arr = (Array.isArray(val) ? val : []) as string[];
        return (
          <div key={field.key} className="col-span-2 space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && " *"}
              {field.tooltip && <FieldTooltip content={field.tooltip} />}
            </Label>
            <MultiSelectCountry
              value={arr}
              onChange={(countries) => onChange(field.key, countries)}
              disabled={readOnly}
              placeholder={field.placeholder ?? "Search countries…"}
            />
          </div>
        );
      }

      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {Object.entries(sections).map(([sectionName, sectionFields]) => {
        // Skip section if all fields are hidden
        const visibleFields = sectionFields.filter(isVisible);
        if (visibleFields.length === 0) return null;

        return (
          <Card key={sectionName}>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">{sectionName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {visibleFields.map(renderField)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
