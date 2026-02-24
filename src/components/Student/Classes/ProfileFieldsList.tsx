"use client";

import { ProfileField } from "@/types/profileFields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface ProfileFieldsListProps {
  fields: ProfileField[];
  responses: Record<string, string>;
  onResponseChange: (fieldId: string, value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export default function ProfileFieldsList({
  fields,
  responses,
  onResponseChange,
  disabled = false,
  idPrefix = "field-",
}: ProfileFieldsListProps) {
  const sortedFields = [...fields].sort((a, b) => a.position - b.position);

  return (
    <>
      {sortedFields.map((field) => (
        <div key={field.id} className="space-y-2">
          <Label htmlFor={`${idPrefix}${field.id}`}>
            {field.field_name}
            {field.is_mandatory ? (
              <span className="text-destructive ml-1">*</span>
            ) : (
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                (optional)
              </span>
            )}
          </Label>

          {field.field_type === "text" ||
          field.field_type === "number" ||
          field.field_type === "phone" ? (
            <Input
              id={`${idPrefix}${field.id}`}
              type={
                field.field_type === "number"
                  ? "text"
                  : field.field_type === "phone"
                    ? "tel"
                    : "text"
              }
              inputMode={
                field.field_type === "number"
                  ? "decimal"
                  : field.field_type === "phone"
                    ? "tel"
                    : "text"
              }
              placeholder={
                field.field_type === "number"
                  ? "e.g., 42"
                  : field.field_type === "phone"
                    ? "e.g., 9944874562"
                    : `Enter ${field.field_name.toLowerCase()}`
              }
              value={responses[field.id] || ""}
              onChange={(e) => onResponseChange(field.id, e.target.value)}
              disabled={disabled}
            />
          ) : (
            <SearchableSelect
              id={`${idPrefix}${field.id}`}
              value={responses[field.id] || ""}
              onValueChange={(value) => onResponseChange(field.id, value)}
              options={field.options ?? []}
              placeholder={`Select ${field.field_name.toLowerCase()}`}
              disabled={disabled}
            />
          )}
        </div>
      ))}
    </>
  );
}
