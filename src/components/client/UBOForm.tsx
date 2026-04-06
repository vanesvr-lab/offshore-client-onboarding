"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { UBO } from "@/types";

const NATIONALITIES = [
  "Mauritian", "British", "French", "American", "Indian", "Chinese",
  "Singaporean", "South African", "Emirati", "Swiss", "German",
  "Dutch", "Luxembourgish", "Australian", "Canadian", "Japanese",
  "Brazilian", "Italian", "Spanish", "Portuguese", "Belgian",
  "Irish", "Swedish", "Norwegian", "Danish", "Other",
];

interface UBOFormProps {
  ubos: UBO[];
  onChange: (ubos: UBO[]) => void;
}

const emptyUBO: UBO = {
  full_name: "",
  nationality: "",
  date_of_birth: "",
  ownership_percentage: 0,
  passport_number: "",
};

export function UBOForm({ ubos, onChange }: UBOFormProps) {
  function addUBO() {
    onChange([...ubos, { ...emptyUBO }]);
  }

  function removeUBO(idx: number) {
    onChange(ubos.filter((_, i) => i !== idx));
  }

  function updateUBO(idx: number, field: keyof UBO, value: string | number) {
    const updated = ubos.map((ubo, i) =>
      i === idx ? { ...ubo, [field]: value } : ubo
    );
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        List all individuals owning 25% or more of the entity. Minimum 1
        required.
      </p>
      {ubos.map((ubo, idx) => (
        <div key={idx} className="rounded-lg border bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-brand-navy">
              UBO {idx + 1}
            </span>
            {ubos.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeUBO(idx)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full name *</Label>
              <Input
                value={ubo.full_name}
                onChange={(e) => updateUBO(idx, "full_name", e.target.value)}
                placeholder="John Smith"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nationality *</Label>
              <Select
                value={ubo.nationality || undefined}
                onValueChange={(v) => updateUBO(idx, "nationality", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select nationality" />
                </SelectTrigger>
                <SelectContent>
                  {NATIONALITIES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date of birth *</Label>
              <Input
                type="date"
                value={ubo.date_of_birth}
                onChange={(e) =>
                  updateUBO(idx, "date_of_birth", e.target.value)
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ownership % *</Label>
              <Input
                type="number"
                min={25}
                max={100}
                value={ubo.ownership_percentage || ""}
                onChange={(e) =>
                  updateUBO(
                    idx,
                    "ownership_percentage",
                    Number(e.target.value)
                  )
                }
                required
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Passport number *</Label>
              <Input
                value={ubo.passport_number}
                onChange={(e) =>
                  updateUBO(idx, "passport_number", e.target.value)
                }
                placeholder="AB123456"
                required
              />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addUBO}>
        <Plus className="mr-2 h-4 w-4" /> Add UBO
      </Button>
    </div>
  );
}
