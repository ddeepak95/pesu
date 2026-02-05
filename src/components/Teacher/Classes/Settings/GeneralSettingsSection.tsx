"use client";

import { useState } from "react";
import { Class } from "@/types/class";
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
import { supportedLanguages } from "@/utils/supportedLanguages";
import { updateClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";

interface GeneralSettingsSectionProps {
  classData: Class;
  isOwner: boolean;
  onUpdated: () => void;
}

export default function GeneralSettingsSection({
  classData,
  isOwner,
  onUpdated,
}: GeneralSettingsSectionProps) {
  const { user } = useAuth();
  const [className, setClassName] = useState(classData.name);
  const [preferredLanguage, setPreferredLanguage] = useState(
    classData.preferred_language || "en"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges =
    className !== classData.name ||
    preferredLanguage !== (classData.preferred_language || "en");

  const handleSave = async () => {
    if (!user || !isOwner) return;

    if (!className.trim()) {
      setError("Class name is required");
      return;
    }

    if (className.trim().length < 2) {
      setError("Class name must be at least 2 characters");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateClass(classData.id, className.trim(), user.id, preferredLanguage);
      setSuccess(true);
      onUpdated();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error updating class:", err);
      setError("Failed to update class. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Basic class information including name and preferred language.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOwner && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only the class owner can edit class details.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="className">Class Name</Label>
          <Input
            id="className"
            placeholder="e.g., Math 101"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            disabled={!isOwner || saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredLanguage">Preferred Language</Label>
          <Select
            value={preferredLanguage}
            onValueChange={setPreferredLanguage}
            disabled={!isOwner || saving}
          >
            <SelectTrigger id="preferredLanguage">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Class updated successfully.</p>
        )}

        {isOwner && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
