"use client";

import { useEffect, useMemo, useState } from "react";
import { ContentItem } from "@/types/contentItem";
import {
  type ContentDuplicateMode,
  contentDuplicateFailureMessage,
} from "@/lib/contentPlacements";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { duplicateContentItem } from "@/lib/queries/duplicateContent";
import { useClassesByUser, useClassGroups, invalidateContentItemsByGroup } from "@/hooks/swr";
import { DuplicateContentModeSelect } from "@/components/Teacher/Classes/DuplicateContentModeSelect";
import { showErrorToast } from "@/lib/toast";

export default function DuplicateContentDialog({
  open,
  onOpenChange,
  item,
  onDuplicated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ContentItem | null;
  onDuplicated?: () => void;
}) {
  const { user } = useAuth();

  const classesQuery = useClassesByUser(open ? user?.id ?? null : null);
  const classes = useMemo(
    () => classesQuery.data ?? [],
    [classesQuery.data]
  );

  const [destinationClassDbId, setDestinationClassDbId] = useState<string>("");
  const [destinationGroupId, setDestinationGroupId] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<ContentDuplicateMode>("copy");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const groupsQuery = useClassGroups(
    open && destinationClassDbId ? destinationClassDbId : null
  );
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  const linkedAllowed = !!item && destinationClassDbId === item.class_id;
  useEffect(() => {
    if (!linkedAllowed && duplicateMode === "linked") {
      setDuplicateMode("copy");
    }
  }, [linkedAllowed, duplicateMode]);

  // Default the destination class to the source item's class when possible,
  // otherwise the first class, as soon as data arrives. Reset group when
  // `groups` changes. We use the "store info from previous render" pattern
  // (rather than `useEffect` + `setState`) for the classes/groups sync.
  const [seenClassesRef, setSeenClassesRef] = useState<unknown>(null);
  if (classesQuery.data && seenClassesRef !== classesQuery.data) {
    setSeenClassesRef(classesQuery.data);
    if (!destinationClassDbId && classes.length > 0) {
      const preferred =
        item?.class_id && classes.some((c) => c.id === item.class_id)
          ? item.class_id
          : classes[0].id;
      setDestinationClassDbId(preferred);
    }
  }

  const [seenGroupsRef, setSeenGroupsRef] = useState<unknown>(null);
  if (groupsQuery.data && seenGroupsRef !== groupsQuery.data) {
    setSeenGroupsRef(groupsQuery.data);
    if (groups.length === 0) {
      if (destinationGroupId !== "") setDestinationGroupId("");
    } else if (
      !destinationGroupId ||
      !groups.some((g) => g.id === destinationGroupId)
    ) {
      setDestinationGroupId(groups[0].id);
    }
  }

  useEffect(() => {
    if (!open) {
      setDestinationClassDbId("");
      setDestinationGroupId("");
      setSubmitError(null);
      setSeenClassesRef(null);
      setSeenGroupsRef(null);
    }
  }, [open]);

  const destinationClass = useMemo(
    () => classes.find((c) => c.id === destinationClassDbId) ?? null,
    [classes, destinationClassDbId]
  );

  const loadingClasses = classesQuery.isLoading;
  const loadingGroups = groupsQuery.isLoading;
  const loading = loadingClasses || loadingGroups || submitting;
  const error = submitError
    ? submitError
    : classesQuery.error
      ? "Failed to load classes."
      : groupsQuery.error
        ? "Failed to load class groups."
        : null;

  const modeForSubmit: ContentDuplicateMode =
    duplicateMode === "linked" && linkedAllowed ? "linked" : "copy";

  const canSubmit =
    !!item && !!user && !!destinationClassDbId && !!destinationGroupId;

  const handleDuplicate = async () => {
    if (!item || !user) return;
    if (
      modeForSubmit === "linked" &&
      item.class_group_id != null &&
      item.class_group_id === destinationGroupId
    ) {
      const msg = "This material is already in the selected group.";
      setSubmitError(msg);
      showErrorToast(msg);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await duplicateContentItem({
        item,
        destinationClassDbId,
        destinationClassGroupId: destinationGroupId,
        userId: user.id,
        mode: modeForSubmit,
      });
      await invalidateContentItemsByGroup(destinationClassDbId, destinationGroupId);
      if (item.class_group_id && item.class_group_id !== destinationGroupId) {
        await invalidateContentItemsByGroup(item.class_id, item.class_group_id);
      }
      onOpenChange(false);
      onDuplicated?.();
    } catch (err: unknown) {
      console.error("Error duplicating content:", err);
      const message = contentDuplicateFailureMessage(err, "Failed to duplicate content.");
      setSubmitError(message);
      showErrorToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate to…</DialogTitle>
          <DialogDescription>
            Add this item to another class group as an independent copy or a
            linked placement that shares the same underlying material.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Destination class</Label>
            <Select
              value={destinationClassDbId}
              onValueChange={setDestinationClassDbId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Destination group</Label>
            <Select
              value={destinationGroupId}
              onValueChange={setDestinationGroupId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name || `Group ${g.group_index + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destinationClass && (
              <p className="text-xs text-muted-foreground">
                Class ID: {destinationClass.class_id}
              </p>
            )}
          </div>

          <DuplicateContentModeSelect
            value={duplicateMode}
            onChange={setDuplicateMode}
            linkedDisabled={!linkedAllowed}
          />
          {!linkedAllowed && (
            <p className="text-xs text-muted-foreground">
              Linked duplicate is only available when the destination class is
              the same as the source.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDuplicate}
            disabled={!canSubmit || loading}
          >
            {submitting ? "Duplicating…" : "Duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
