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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertStudentProfile } from "@/lib/queries/profileFields";

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
      if (!field.is_mandatory) continue;
      const response = responses[field.id];
      if (!response || response.trim() === "") {
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    const missingFields: string[] = [];
    for (const field of fields) {
      if (!field.is_mandatory) continue;
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
          {sortedFields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={`profile-${field.id}`}>
                {field.field_name}
                {field.is_mandatory ? (
                  <span className="text-destructive ml-1">*</span>
                ) : (
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    (optional)
                  </span>
                )}
              </Label>

              {field.field_type === "text" ? (
                <Input
                  id={`profile-${field.id}`}
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
                  <SelectTrigger id={`profile-${field.id}`}>
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
