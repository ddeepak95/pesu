"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Library, Pencil, Plus, Trash2 } from "lucide-react";

import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type {
  ActivityTemplateRow,
  TemplateOwnerScope,
} from "@/lib/queries/activityTemplates";
import {
  invalidateActivityTemplatesCache,
  useAvailableTemplatesForClass,
} from "@/hooks/swr";
import {
  archiveTemplate,
  removeTemplateFromClass,
  setSystemTemplateAvailability,
} from "@/lib/templates/actions";
import { TemplateViewDialog } from "@/components/Teacher/Templates/TemplateViewDialog";

import AddFromLibraryDialog from "./AddFromLibraryDialog";

interface ManageActivityTemplatesProps {
  classDbId: string;
  classShortId: string;
  classDisplayName: string;
  userId: string;
}

const SCOPE_LABEL: Record<TemplateOwnerScope, string> = {
  system: "Platform",
  institution: "Institution",
  class: "Class",
  user: "Personal",
};

export default function ManageActivityTemplates({
  classDbId,
  classShortId,
  classDisplayName,
  userId,
}: ManageActivityTemplatesProps) {
  const router = useTrackedRouter();
  const availableQuery = useAvailableTemplatesForClass(classDbId);
  const available = availableQuery.data ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<ActivityTemplateRow | null>(null);
  const [pendingArchive, setPendingArchive] =
    useState<ActivityTemplateRow | null>(null);

  const basePath = `/teacher/classes/${classShortId}/settings/activity-templates`;

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

  function handleRemove(t: ActivityTemplateRow) {
    if (t.owner_scope === "class") {
      setPendingArchive(t);
      return;
    }
    if (t.owner_scope === "system") {
      void act(
        t.id,
        () => setSystemTemplateAvailability(classDbId, t.id, false),
        `"${t.name}" is hidden from this class.`,
      );
      return;
    }
    // user / institution — added via a palette link.
    void act(
      t.id,
      () => removeTemplateFromClass(classDbId, t.id),
      `Removed "${t.name}" from this class.`,
    );
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <Link
          href={`/teacher/classes/${classShortId}/settings`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Class settings
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Manage Activity Templates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The activity types teachers can pick when building an assignment in{" "}
              {classDisplayName}.
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
            No activity types are available in this class yet. Use{" "}
            <span className="font-medium">Add from Library</span> or{" "}
            <span className="font-medium">Create</span> to add one.
          </div>
        ) : (
          <div className="space-y-3">
            {available.map((t) => {
              const isClass = t.owner_scope === "class";
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewTarget(t)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                    </Button>
                    {isClass && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`${basePath}/${t.id}/edit`)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === t.id}
                      onClick={() => handleRemove(t)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TemplateViewDialog
        template={viewTarget}
        open={viewTarget !== null}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />

      <AddFromLibraryDialog
        classDbId={classDbId}
        userId={userId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Archive (Remove) confirm for class-owned types */}
      <Dialog
        open={pendingArchive !== null}
        onOpenChange={(open) => !open && setPendingArchive(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Remove class activity type?
            </DialogTitle>
            <DialogDescription>
              &quot;{pendingArchive?.name}&quot; will be archived and removed
              from this class. Existing assignments keep their own snapshot and
              are unaffected.
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
    </PageLayout>
  );
}
