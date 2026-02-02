"use client";

import { useState } from "react";
import { MandatoryField } from "@/types/mandatoryFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertStudentClassInfo } from "@/lib/queries/mandatoryFields";

interface MandatoryInfoDialogProps {
  classDbId: string;
  className: string;
  studentId: string;
  fields: MandatoryField[];
  existingResponses?: Record<string, string>;
  open: boolean;
  onComplete: () => void;
}

export default function MandatoryInfoDialog({
  classDbId,
  className,
  studentId,
  fields,
  existingResponses = {},
  open,
  onComplete,
}: MandatoryInfoDialogProps) {
  const [responses, setResponses] =
    useState<Record<string, string>>(existingResponses);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResponseChange = (fieldId: string, value: string) => {
    setResponses({ ...responses, [fieldId]: value });
  };

  const isFormValid = () => {
    for (const field of fields) {
      const response = responses[field.id];
      if (!response || response.trim() === "") {
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    // Validate all fields are filled
    const missingFields: string[] = [];
    for (const field of fields) {
      const response = responses[field.id];
      if (!response || response.trim() === "") {
        missingFields.push(field.field_name);
      }
    }

    if (missingFields.length > 0) {
      setError(`Please fill in: ${missingFields.join(", ")}`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await upsertStudentClassInfo(classDbId, studentId, responses);
      onComplete();
    } catch (err) {
      console.error("Error saving student info:", err);
      setError("Failed to save your information. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Sort fields by position
  const sortedFields = [...fields].sort((a, b) => a.position - b.position);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Hide the close button by not rendering it
        // The default DialogContent includes a close button, but we'll override with CSS
      >
        <style jsx global>{`
          [role="dialog"] button[aria-label="Close"] {
            display: none;
          }
          [role="dialog"] .absolute.right-4.top-4 {
            display: none;
          }
        `}</style>
        <DialogHeader>
          <DialogTitle>Required Information</DialogTitle>
          <DialogDescription>
            Please provide the following information to access content in{" "}
            <span className="font-medium">{className}</span>. All fields are
            required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {sortedFields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={`field-${field.id}`}>{field.field_name}</Label>

              {field.field_type === "text" ? (
                <Input
                  id={`field-${field.id}`}
                  placeholder={`Enter ${field.field_name.toLowerCase()}`}
                  value={responses[field.id] || ""}
                  onChange={(e) =>
                    handleResponseChange(field.id, e.target.value)
                  }
                  disabled={saving}
                />
              ) : (
                <Select
                  value={responses[field.id] || ""}
                  onValueChange={(value) =>
                    handleResponseChange(field.id, value)
                  }
                  disabled={saving}
                >
                  <SelectTrigger id={`field-${field.id}`}>
                    <SelectValue
                      placeholder={`Select ${field.field_name.toLowerCase()}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options || []).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !isFormValid()}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
