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
import { reconfigureClassGroups } from "@/lib/queries/groups";

interface GroupSettingsSectionProps {
  classData: Class;
  isOwner: boolean;
  onUpdated: () => void;
}

export default function GroupSettingsSection({
  classData,
  isOwner,
  onUpdated,
}: GroupSettingsSectionProps) {
  const [groupCount, setGroupCount] = useState<number>(
    classData.group_count ?? 1
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = groupCount !== (classData.group_count ?? 1);

  const handleSave = async () => {
    if (!isOwner) return;
    if (!Number.isFinite(groupCount) || groupCount < 1) {
      setError("Group count must be at least 1.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await reconfigureClassGroups({
        classDbId: classData.id,
        newGroupCount: groupCount,
      });
      setSuccess(true);
      onUpdated();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      console.error("Error updating group count:", err);
      setError(
        "Failed to update group count. Make sure the groups migration is applied."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          Set how many groups this class has. When decreasing, students in
          removed groups are reassigned.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOwner && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only the class owner can change group settings.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="groupCount">Number of groups</Label>
          <Input
            id="groupCount"
            type="number"
            min={1}
            value={groupCount}
            disabled={!isOwner || loading}
            onChange={(e) => setGroupCount(Number(e.target.value))}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">
            Group settings updated successfully.
          </p>
        )}

        {isOwner && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isOwner || loading || !hasChanges}
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
