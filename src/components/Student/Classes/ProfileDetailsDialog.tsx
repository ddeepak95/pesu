"use client";

import { useState, useEffect } from "react";
import { ProfileField } from "@/types/profileFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProfileFieldsList from "@/components/Student/Classes/ProfileFieldsList";
import { upsertStudentProfile } from "@/lib/queries/profileFields";
import { validateFieldValue } from "@/lib/profileFieldValidation";

interface ProfileDetailsDialogProps {
  classDbId: string;
  className: string;
  studentId: string;
  fields: ProfileField[];
  existingResponses?: Record<string, string>;
  open: boolean;
  onComplete: () => void;
}

export default function ProfileDetailsDialog({
  classDbId,
  className,
  studentId,
  fields,
  existingResponses = {},
  open,
  onComplete,
}: ProfileDetailsDialogProps) {
  const [responses, setResponses] =
    useState<Record<string, string>>(existingResponses);

  // Sync when existingResponses changes (e.g. after async SWR load)
  useEffect(() => {
    setResponses(existingResponses);
  }, [existingResponses]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResponseChange = (fieldId: string, value: string) => {
    setResponses({ ...responses, [fieldId]: value });
  };

  const isFormValid = () => {
    for (const field of fields) {
      const response = responses[field.id] ?? "";
      const { valid } = validateFieldValue(
        field.field_type,
        response,
        field.is_mandatory
      );
      if (!valid) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    const errors: string[] = [];
    for (const field of fields) {
      const response = responses[field.id] ?? "";
      const { valid, message } = validateFieldValue(
        field.field_type,
        response,
        field.is_mandatory
      );
      if (!valid) {
        errors.push(message ? `${field.field_name}: ${message}` : field.field_name);
      }
    }

    if (errors.length > 0) {
      setError(errors.join("; "));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await upsertStudentProfile(classDbId, studentId, responses);
      onComplete();
    } catch (err) {
      console.error("Error saving profile details:", err);
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
        className="max-w-lg max-h-[85vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
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
          <DialogTitle>Profile Details</DialogTitle>
          <DialogDescription>
            Please provide the following information for{" "}
            <span className="font-medium">{className}</span>. Fields marked with
            * are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 pr-2 overflow-y-auto flex-1">
          <ProfileFieldsList
            fields={sortedFields}
            responses={responses}
            onResponseChange={handleResponseChange}
            disabled={saving}
            idPrefix="field-"
          />

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
