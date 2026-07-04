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
  useInstitutionTemplateEnablement,
  useInstitutionTemplates,
  useMyTemplates,
  useSystemTemplates,
} from "@/hooks/swr";
import {
  addTemplateToClass,
  cloneTemplate,
  removeTemplateFromClass,
  setTemplateAvailability,
} from "@/lib/templates/actions";

type Source = "platform" | "institution" | "personal";

export type DialogScope =
  | {
      kind: "class";
      classId: string;
      userId: string;
      /** This class's institution, if any — powers the "Institution library" source. */
      institutionId: string | null;
    }
  | { kind: "institution"; institutionId: string };

interface AddFromLibraryDialogProps {
  scope: DialogScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Browse a source library and bring a template into a class (or, in
 * institution mode, into an institution's default list). "Add" is a
 * membership link/override (stays owned by the source, read-only here);
 * "Clone" (class mode only) makes an editable class-owned copy.
 *
 * Class mode offers Platform / Institution / Personal sources, matching the
 * class's own palette. Institution mode only has a Platform source (an
 * institution admin curates system templates for their institution, not a
 * nested library of its own) — the source selector is hidden in that case.
 *
 * Platform/Institution-owned-template availability is a baseline (a
 * template's own `default_listed`) that each tier can override: institution
 * overrides the platform baseline for system templates, and a class overrides
 * whatever it inherits (the institution-resolved value for system templates,
 * or the raw baseline for institution-owned/personal templates never having
 * an institution tier above them).
 */
export default function AddFromLibraryDialog({
  scope,
  open,
  onOpenChange,
}: AddFromLibraryDialogProps) {
  const [source, setSource] = useState<Source>("platform");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isInstitutionMode = scope.kind === "institution";
  // The institution whose system-template overrides are relevant here: itself
  // in institution mode, or the class's own institution (if any) in class mode.
  const institutionId = scope.institutionId;
  const effectiveSource: Source = isInstitutionMode ? "platform" : source;

  const systemQuery = useSystemTemplates();
  const institutionTemplatesQuery = useInstitutionTemplates(
    !isInstitutionMode ? institutionId : null,
  );
  const myQuery = useMyTemplates(scope.kind === "class" ? scope.userId : null);
  const classEnablementQuery = useClassTemplateEnablement(
    scope.kind === "class" ? scope.classId : null,
  );
  const institutionEnablementQuery = useInstitutionTemplateEnablement(institutionId);

  const classOverrides = useMemo(
    () =>
      new Map(
        (classEnablementQuery.data ?? []).map((r) => [r.template_id, r.enabled]),
      ),
    [classEnablementQuery.data],
  );
  const institutionOverrides = useMemo(
    () =>
      new Map(
        (institutionEnablementQuery.data ?? []).map((r) => [
          r.template_id,
          r.enabled,
        ]),
      ),
    [institutionEnablementQuery.data],
  );
  const addedPersonal = useMemo(
    () =>
      new Set(
        (classEnablementQuery.data ?? [])
          .filter((r) => r.enabled)
          .map((r) => r.template_id),
      ),
    [classEnablementQuery.data],
  );

  const sourceRows = useMemo<ActivityTemplateRow[]>(
    () =>
      effectiveSource === "platform"
        ? (systemQuery.data ?? [])
        : effectiveSource === "institution"
          ? (institutionTemplatesQuery.data ?? [])
          : (myQuery.data ?? []),
    [effectiveSource, systemQuery.data, institutionTemplatesQuery.data, myQuery.data],
  );
  const loading =
    effectiveSource === "platform"
      ? systemQuery.isLoading ||
        (isInstitutionMode
          ? institutionEnablementQuery.isLoading
          : classEnablementQuery.isLoading)
      : effectiveSource === "institution"
        ? institutionTemplatesQuery.isLoading || classEnablementQuery.isLoading
        : myQuery.isLoading || classEnablementQuery.isLoading;

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
    if (isInstitutionMode) {
      return institutionOverrides.get(t.id) ?? t.default_listed;
    }
    if (effectiveSource === "platform") {
      const institutionResolved = institutionOverrides.get(t.id) ?? t.default_listed;
      return classOverrides.get(t.id) ?? institutionResolved;
    }
    if (effectiveSource === "institution") {
      return classOverrides.get(t.id) ?? t.default_listed;
    }
    return addedPersonal.has(t.id);
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
    if (scope.kind === "institution") {
      void act(
        t.id,
        () =>
          setTemplateAvailability(
            { kind: "institution", institutionId: scope.institutionId },
            t.id,
            !added,
          ),
        added
          ? `"${t.name}" is no longer default-listed for this institution.`
          : `"${t.name}" is now default-listed for this institution.`,
      );
      return;
    }
    if (effectiveSource === "platform" || effectiveSource === "institution") {
      void act(
        t.id,
        () =>
          setTemplateAvailability({ kind: "class", classId: scope.classId }, t.id, !added),
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
          ? removeTemplateFromClass(scope.classId, t.id)
          : addTemplateToClass(scope.classId, t.id),
      added ? `Removed "${t.name}".` : `Added "${t.name}".`,
    );
  }

  function clone(t: ActivityTemplateRow) {
    if (scope.kind !== "class") return;
    void act(
      t.id,
      () =>
        cloneTemplate({
          sourceId: t.id,
          destScope: "class",
          classId: scope.classId,
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
            {isInstitutionMode ? (
              <>
                Choose which platform activity types are default-listed for
                every class in this institution. Everything else stays
                findable via each class&apos;s own Add from Library.
              </>
            ) : (
              <>
                Add an activity type to this class. <strong>Add</strong> makes
                it selectable here (still owned by the source, read-only).{" "}
                <strong>Clone</strong> makes an editable copy owned by this
                class.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {!isInstitutionMode && (
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
          )}
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
            {effectiveSource === "institution" && !isInstitutionMode && !institutionId ? (
              <p className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                This class isn&apos;t part of an institution.
              </p>
            ) : loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading templates…
              </p>
            ) : sourceRows.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                {effectiveSource === "personal" ? (
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
                          {isInstitutionMode
                            ? "Makes it default-listed for every class in this institution. It stays owned by the platform and can't be edited here."
                            : "Makes it selectable in this class. It stays owned by the source and can't be edited here."}
                        </TooltipContent>
                      </Tooltip>
                      {scope.kind === "class" && (
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
                            Makes an editable copy owned by this class.
                            Changes won&apos;t affect the original.
                          </TooltipContent>
                        </Tooltip>
                      )}
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
