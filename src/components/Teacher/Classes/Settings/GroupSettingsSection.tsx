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
import { reconfigureClassGroups } from "@/lib/queries/groups";
import { updateClass } from "@/lib/queries/classes";

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
  const [strategy, setStrategy] = useState<"round_robin" | "default_group">(
    classData.student_assignment_strategy ?? "round_robin"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const groupCountChanged = groupCount !== (classData.group_count ?? 1);
  const strategyChanged =
    strategy !== (classData.student_assignment_strategy ?? "round_robin");
  const hasChanges = groupCountChanged || strategyChanged;

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
      // Save group count if changed
      if (groupCountChanged) {
        await reconfigureClassGroups({
          classDbId: classData.id,
          newGroupCount: groupCount,
        });
      }

      // Save assignment strategy if changed
      if (strategyChanged) {
        await updateClass(classData.id, {
          student_assignment_strategy: strategy,
        });
      }

      setSuccess(true);
      onUpdated();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      console.error("Error updating group settings:", err);
      setError("Failed to update group settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          Configure how many groups this class has and how students are assigned
          to groups.
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
          <p className="text-xs text-muted-foreground">
            When decreasing, students in removed groups are reassigned
            automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignmentStrategy">
            Student assignment strategy
          </Label>
          <Select
            value={strategy}
            onValueChange={(value) =>
              setStrategy(value as "round_robin" | "default_group")
            }
            disabled={!isOwner || loading}
          >
            <SelectTrigger id="assignmentStrategy">
              <SelectValue placeholder="Select a strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round Robin</SelectItem>
              <SelectItem value="default_group">Default Group</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {strategy === "round_robin"
              ? "Students are distributed evenly across groups as they join the class."
              : "All new students are added to Group 1. You can reassign them manually."}
          </p>
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
