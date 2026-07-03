"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";
import {
  invalidateActivityTemplatesCache,
  useClassTemplateEnablement,
  useMyTemplates,
  useSystemTemplates,
} from "@/hooks/swr";
import {
  addTemplateToClass,
  cloneTemplate,
  removeTemplateFromClass,
  setSystemTemplateAvailability,
} from "@/lib/templates/actions";

type Source = "platform" | "institution" | "personal";

interface AddFromLibraryDialogProps {
  classDbId: string;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Browse a source library (Platform / Institution / Personal) and bring a
 * template into this class. "Add" is a membership link (stays owned by the
 * source, read-only here); "Clone" makes an editable class-owned copy.
 * Institution is scaffolded but deferred (no backend yet).
 */
export default function AddFromLibraryDialog({
  classDbId,
  userId,
  open,
  onOpenChange,
}: AddFromLibraryDialogProps) {
  const [source, setSource] = useState<Source>("platform");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const systemQuery = useSystemTemplates();
  const myQuery = useMyTemplates(userId);
  const enablementQuery = useClassTemplateEnablement(classDbId);

  const prunedSystem = useMemo(
    () =>
      new Set(
        (enablementQuery.data ?? [])
          .filter((r) => !r.enabled)
          .map((r) => r.template_id),
      ),
    [enablementQuery.data],
  );
  const addedPersonal = useMemo(
    () =>
      new Set(
        (enablementQuery.data ?? [])
          .filter((r) => r.enabled)
          .map((r) => r.template_id),
      ),
    [enablementQuery.data],
  );

  const sourceRows = useMemo<ActivityTemplateRow[]>(
    () =>
      source === "platform"
        ? (systemQuery.data ?? [])
        : source === "personal"
          ? (myQuery.data ?? [])
          : [],
    [source, systemQuery.data, myQuery.data],
  );
  const loading =
    source === "platform"
      ? systemQuery.isLoading || enablementQuery.isLoading
      : source === "personal"
        ? myQuery.isLoading || enablementQuery.isLoading
        : false;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceRows;
    return sourceRows.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [sourceRows, query]);

  function isAdded(t: ActivityTemplateRow) {
    return source === "platform"
      ? !prunedSystem.has(t.id)
      : addedPersonal.has(t.id);
  }

  async function act(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    try {
      await fn();
      await invalidateActivityTemplatesCache();
      showSuccessToast(msg);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleAdd(t: ActivityTemplateRow) {
    const added = isAdded(t);
    if (source === "platform") {
      void act(
        t.id,
        () =>
          setSystemTemplateAvailability(classDbId, t.id, added ? false : true),
        added
          ? `"${t.name}" hidden from this class.`
          : `"${t.name}" added to this class.`,
      );
      return;
    }
    void act(
      t.id,
      () =>
        added
          ? removeTemplateFromClass(classDbId, t.id)
          : addTemplateToClass(classDbId, t.id),
      added ? `Removed "${t.name}".` : `Added "${t.name}".`,
    );
  }

  function clone(t: ActivityTemplateRow) {
    void act(
      t.id,
      () =>
        cloneTemplate({
          sourceId: t.id,
          destScope: "class",
          classId: classDbId,
        }),
      `Cloned "${t.name}" into this class.`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Add from Library</DialogTitle>
          <DialogDescription>
            Add an activity type to this class. <strong>Add</strong> makes it
            selectable here (still owned by the source, read-only).{" "}
            <strong>Clone</strong> makes an editable copy owned by this class.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={source} onValueChange={(v) => setSource(v as Source)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">Platform library</SelectItem>
              <SelectItem value="institution">Institution library</SelectItem>
              <SelectItem value="personal">Personal library</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="pl-9"
            />
          </div>
        </div>

        <TooltipProvider delayDuration={300}>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {source === "institution" ? (
              <p className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                Institution templates aren&apos;t available yet.
              </p>
            ) : loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading templates…
              </p>
            ) : sourceRows.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                {source === "personal" ? (
                  <>
                    You have no personal templates yet.{" "}
                    <Link
                      href="/teacher/activity-templates"
                      className="underline"
                    >
                      Create one in My Activity Templates
                    </Link>
                    .
                  </>
                ) : (
                  "No templates found."
                )}
              </p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No templates match &quot;{query}&quot;.
              </p>
            ) : (
              rows.map((t) => {
                const added = isAdded(t);
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {t.name}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={`/activity-templates/${t.id}/preview`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />{" "}
                          Preview
                        </a>
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={added ? "outline" : "secondary"}
                            size="sm"
                            disabled={busyId === t.id}
                            onClick={() => toggleAdd(t)}
                          >
                            {added ? (
                              <>
                                <Check className="mr-1.5 h-3.5 w-3.5" /> Added
                              </>
                            ) : (
                              <>
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px]">
                          Makes it selectable in this class. It stays owned by
                          the source and can&apos;t be edited here.
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === t.id}
                            onClick={() => clone(t)}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Clone
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px]">
                          Makes an editable copy owned by this class. Changes
                          won&apos;t affect the original.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
