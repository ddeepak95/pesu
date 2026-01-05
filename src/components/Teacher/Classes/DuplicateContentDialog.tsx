"use client";

import { useEffect, useMemo, useState } from "react";
import { ContentItem } from "@/types/contentItem";
import { Class } from "@/types/class";
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
import { getClassesByUser } from "@/lib/queries/classes";
import { ClassGroup, getClassGroups } from "@/lib/queries/groups";
import { duplicateContentItem } from "@/lib/queries/duplicateContent";

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

  const [classes, setClasses] = useState<Class[]>([]);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [destinationClassDbId, setDestinationClassDbId] = useState<string>("");
  const [destinationGroupId, setDestinationGroupId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinationClass = useMemo(
    () => classes.find((c) => c.id === destinationClassDbId) ?? null,
    [classes, destinationClassDbId]
  );

  useEffect(() => {
    const load = async () => {
      if (!open) return;
      setError(null);
      setLoading(true);
      try {
        if (!user) throw new Error("You must be logged in");
        const data = await getClassesByUser(user.id);
        setClasses(data);
        const first = data[0]?.id ?? "";
        setDestinationClassDbId(first);
      } catch (err) {
        console.error("Error loading classes:", err);
        const message =
          typeof err === "object" && err !== null
            ? ((err as Record<string, unknown>)["message"] as
                | string
                | undefined)
            : undefined;
        setError(message || "Failed to load classes.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, user]);

  useEffect(() => {
    const loadGroups = async () => {
      if (!open) return;
      if (!destinationClassDbId) {
        setGroups([]);
        setDestinationGroupId("");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const gs = await getClassGroups(destinationClassDbId);
        setGroups(gs);
        setDestinationGroupId(gs[0]?.id ?? "");
      } catch (err) {
        console.error("Error loading groups:", err);
        setError("Failed to load class groups.");
        setGroups([]);
        setDestinationGroupId("");
      } finally {
        setLoading(false);
      }
    };

    loadGroups();
  }, [open, destinationClassDbId]);

  const canSubmit =
    !!item && !!user && !!destinationClassDbId && !!destinationGroupId;

  const handleDuplicate = async () => {
    if (!item || !user) return;
    setLoading(true);
    setError(null);
    try {
      await duplicateContentItem({
        item,
        destinationClassDbId,
        destinationClassGroupId: destinationGroupId,
        userId: user.id,
      });
      onOpenChange(false);
      onDuplicated?.();
    } catch (err: unknown) {
      console.error("Error duplicating content:", err);
      const message =
        typeof err === "object" && err !== null
          ? ((err as Record<string, unknown>)["message"] as string | undefined)
          : undefined;
      setError(message || "Failed to duplicate content.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate to…</DialogTitle>
          <DialogDescription>
            Create a copy of this item in another class group.
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
            {loading ? "Duplicating…" : "Duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



