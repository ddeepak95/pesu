"use client";

import { useState, useEffect } from "react";
import { ProfileField } from "@/types/profileFields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ProfileFieldsList from "@/components/Student/Classes/ProfileFieldsList";
import { upsertStudentProfile } from "@/lib/queries/profileFields";
import { validateFieldValue } from "@/lib/profileFieldValidation";

interface StudentProfileFormProps {
  classDbId: string;
  studentId: string;
  fields: ProfileField[];
  existingResponses: Record<string, string>;
  onSaved?: () => void;
}

export default function StudentProfileForm({
  classDbId,
  studentId,
  fields,
  existingResponses,
  onSaved,
}: StudentProfileFormProps) {
  const [responses, setResponses] =
    useState<Record<string, string>>(existingResponses);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync when existingResponses changes (e.g. after refetch)
  useEffect(() => {
    setResponses(existingResponses);
  }, [existingResponses]);

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

  const handleSave = async () => {
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
    setSuccess(false);

    try {
      await upsertStudentProfile(classDbId, studentId, responses);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSaved?.();
    } catch (err) {
      console.error("Error saving profile details:", err);
      setError("Failed to save your information. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const sortedFields = [...fields].sort((a, b) => a.position - b.position);

  if (fields.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>
            No profile fields have been configured for this class.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Details</CardTitle>
        <CardDescription>
          Update your profile information for this class. Fields marked with *
          are required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <ProfileFieldsList
            fields={sortedFields}
            responses={responses}
            onResponseChange={handleResponseChange}
            disabled={saving}
            idPrefix="profile-"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-green-600">
              Profile saved successfully.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !isFormValid()}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
