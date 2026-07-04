"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Library, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type {
  ActivityTemplateRow,
  TemplateOwnerScope,
} from "@/lib/queries/activityTemplates";
import {
  invalidateActivityTemplatesCache,
  useManageableTemplatesForInstitution,
} from "@/hooks/swr";
import {
  archiveTemplate,
  setTemplateAvailability,
  setTemplateDefaultListed,
} from "@/lib/templates/actions";
import { TemplateViewDialog } from "@/components/Teacher/Templates/TemplateViewDialog";

import AddFromLibraryDialog from "@/components/Teacher/Classes/Settings/AddFromLibraryDialog";

interface ManageInstitutionActivityTemplatesProps {
  institutionId: string;
  institutionName: string;
  /** Route prefix for the institution-owned template create/edit subpages. */
  basePath: string;
  /** Back-link target + label above the header (the institution's settings page). */
  backHref: string;
  backLabel: string;
}

const SCOPE_LABEL: Record<TemplateOwnerScope, string> = {
  system: "Platform",
  institution: "Institution",
  class: "Class",
  user: "Personal",
};

/**
 * Full-page activity-template management for one institution — the
 * institution-settings counterpart to
 * `Teacher/Classes/Settings/ManageActivityTemplates`, same shape: a list of
 * what's currently available (default-listed system templates + all of this
 * institution's own authored templates), "Add from Library" to curate
 * platform types, and "Create" for institution-owned ones.
 */
export default function ManageInstitutionActivityTemplates({
  institutionId,
  institutionName,
  basePath,
  backHref,
  backLabel,
}: ManageInstitutionActivityTemplatesProps) {
  const router = useTrackedRouter();
  const availableQuery = useManageableTemplatesForInstitution(institutionId);
  const available = availableQuery.data ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<ActivityTemplateRow | null>(null);
  const [pendingArchive, setPendingArchive] =
    useState<ActivityTemplateRow | null>(null);

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

  function handleDefaultListedChange(t: ActivityTemplateRow, checked: boolean) {
    void act(
      t.id,
      () =>
        t.owner_scope === "institution"
          ? setTemplateDefaultListed(t.id, checked, { institutionId })
          : setTemplateAvailability({ kind: "institution", institutionId }, t.id, checked),
      checked
        ? `"${t.name}" is now default-listed in every class in this institution.`
        : `"${t.name}" is now opt-in only.`,
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manage Activity Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The activity types default-listed for classes in {institutionName}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Library className="mr-1.5 h-4 w-4" /> Add from Library
          </Button>
          <Button onClick={() => router.push(`${basePath}/new`)}>
            <Plus className="mr-1.5 h-4 w-4" /> Create
          </Button>
        </div>
      </div>

      {availableQuery.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading activity types…
        </div>
      ) : available.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          No activity types are available in this institution yet. Use{" "}
          <span className="font-medium">Add from Library</span> or{" "}
          <span className="font-medium">Create</span> to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {available.map((t) => {
            const isInstitutionOwned = t.owner_scope === "institution";
            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{t.name}</h3>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {SCOPE_LABEL[t.owner_scope]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {t.description || "No description."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={busyId === t.id}
                          onClick={() =>
                            handleDefaultListedChange(t, !t.default_listed)
                          }
                        >
                          {t.default_listed ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px]">
                        {t.default_listed
                          ? "Default-listed: automatically available in every class in this institution. Click to make it opt-in instead."
                          : "Opt-in: teachers can still find and add it via “Add from Library”. Click to make it default-listed for every class."}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewTarget(t)}
                  >
                    View
                  </Button>
                  {isInstitutionOwned && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`${basePath}/${t.id}/edit`)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === t.id}
                        onClick={() => setPendingArchive(t)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TemplateViewDialog
        template={viewTarget}
        open={viewTarget !== null}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />

      <AddFromLibraryDialog
        scope={{ kind: "institution", institutionId }}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Archive (Remove) confirm for institution-owned types */}
      <Dialog
        open={pendingArchive !== null}
        onOpenChange={(open) => !open && setPendingArchive(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Remove institution activity type?
            </DialogTitle>
            <DialogDescription>
              &quot;{pendingArchive?.name}&quot; will be archived and removed
              from this institution. Existing assignments keep their own
              snapshot and are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingArchive(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = pendingArchive;
                setPendingArchive(null);
                if (target)
                  void act(
                    target.id,
                    () => archiveTemplate(target.id),
                    `Removed "${target.name}".`,
                  );
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
