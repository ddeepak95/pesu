"use client";

import { useState } from "react";
import {
  Archive,
  Copy,
  Globe,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
} from "lucide-react";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { TemplateEditor } from "@/components/Platform/Templates/TemplateEditor";
import { cloneSeedDefinition } from "@/components/Platform/Templates/mockData";
import type { MockTemplate } from "@/components/Platform/Templates/types";
import type { TemplateDefinition as RealDefinition } from "@/lib/activityTypes/templates";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";
import {
  fetchClassTemplatesTracked,
  fetchMyTemplatesTracked,
} from "@/lib/swr/imperativeReads";
import {
  archiveTemplate,
  cloneTemplate,
  createTemplate,
  publishAsNewTemplate,
  pullUpstream,
  setTemplateVisibility,
  updateTemplate,
} from "@/lib/templates/actions";

import { fromEditorDefinition, rowToMockTemplate } from "./adapters";

/** Which library this is — drives create ownership and the refresh source. */
export type LibraryOwner =
  | { scope: "user"; userId: string }
  | { scope: "class"; classId: string };

type View =
  | { mode: "gallery" }
  | {
      mode: "edit";
      template: MockTemplate;
      isNew: boolean;
      original: RealDefinition | null;
    };

const CHROME: Record<
  LibraryOwner["scope"],
  { badge: React.ReactNode; ownerLabel: string }
> = {
  user: {
    badge: (
      <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">
        My library · you own this
      </span>
    ),
    ownerLabel: "You (personal library)",
  },
  class: {
    badge: (
      <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
        Class library · co-editable
      </span>
    ),
    ownerLabel: "This class (co-editable by co-teachers)",
  },
};

function blankTemplate(scope: LibraryOwner["scope"]): MockTemplate {
  return {
    id: `new-${Date.now()}`,
    name: "",
    description: "",
    ownerScope: scope,
    visibility: "private",
    status: "active",
    definition: cloneSeedDefinition("learning"),
    updatedAt: new Date().toISOString(),
  };
}

export function TemplateLibrary({
  owner,
  initialTemplates,
  title,
  description,
}: {
  owner: LibraryOwner;
  initialTemplates: ActivityTemplateRow[];
  title: string;
  description: string;
}) {
  const [templates, setTemplates] =
    useState<ActivityTemplateRow[]>(initialTemplates);
  const [view, setView] = useState<View>({ mode: "gallery" });
  const [saving, setSaving] = useState(false);
  const [pendingArchive, setPendingArchive] =
    useState<ActivityTemplateRow | null>(null);
  const [pendingPull, setPendingPull] = useState<ActivityTemplateRow | null>(
    null,
  );
  const [pendingPublish, setPendingPublish] =
    useState<ActivityTemplateRow | null>(null);

  async function refresh() {
    setTemplates(
      owner.scope === "user"
        ? await fetchMyTemplatesTracked(owner.userId)
        : await fetchClassTemplatesTracked(owner.classId),
    );
  }

  async function run(fn: () => Promise<unknown>, successMsg: string) {
    try {
      await fn();
      await refresh();
      showSuccessToast(successMsg);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function handleSave(next: MockTemplate) {
    setSaving(true);
    try {
      const original = view.mode === "edit" ? view.original : null;
      const definition = fromEditorDefinition(next.definition, original);
      const isNew = view.mode === "edit" && view.isNew;

      if (isNew) {
        await createTemplate({
          scope: owner.scope,
          classId: owner.scope === "class" ? owner.classId : undefined,
          name: next.name,
          description: next.description || null,
          visibility: next.visibility,
          definition,
        });
      } else {
        await updateTemplate(next.id, {
          name: next.name,
          description: next.description || null,
          definition,
        });
        const prev = templates.find((t) => t.id === next.id);
        if (prev && prev.visibility !== next.visibility) {
          await setTemplateVisibility(next.id, next.visibility);
        }
      }
      await refresh();
      showSuccessToast(isNew ? "Template created." : "Template saved.");
      setView({ mode: "gallery" });
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (view.mode === "edit") {
    return (
      <TemplateEditor
        template={view.template}
        isNew={view.isNew}
        saving={saving}
        onSave={handleSave}
        onCancel={() => setView({ mode: "gallery" })}
        ownerBadge={CHROME[owner.scope].badge}
        ownerLabel={CHROME[owner.scope].ownerLabel}
        newTitle="New template"
        footerNote={null}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          onClick={() =>
            setView({
              mode: "edit",
              template: blankTemplate(owner.scope),
              isNew: true,
              original: null,
            })
          }
        >
          <Plus className="mr-1.5 h-4 w-4" /> New template
        </Button>
      </header>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          No templates yet. Click{" "}
          <span className="font-medium">New template</span> to create one, or
          clone a system or shared template.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const isClone = t.forked_from !== null;
            const openEdit = () =>
              setView({
                mode: "edit",
                template: rowToMockTemplate(t),
                isNew: false,
                original: t.definition,
              });
            return (
              <div
                key={t.id}
                className="group flex flex-col rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <button onClick={openEdit} className="text-left">
                    <h3 className="font-medium leading-tight">{t.name}</h3>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={openEdit}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void run(
                            () =>
                              cloneTemplate({
                                sourceId: t.id,
                                destScope: owner.scope,
                                classId:
                                  owner.scope === "class"
                                    ? owner.classId
                                    : undefined,
                              }),
                            "Cloned into this library.",
                          )
                        }
                      >
                        <Copy className="mr-2 h-4 w-4" /> Clone
                      </DropdownMenuItem>
                      {t.visibility === "private" ? (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(
                              () => setTemplateVisibility(t.id, "public"),
                              "Template is now public (shareable by link).",
                            )
                          }
                        >
                          <Globe className="mr-2 h-4 w-4" /> Make public
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(
                              () => setTemplateVisibility(t.id, "private"),
                              "Template is now private.",
                            )
                          }
                        >
                          <Lock className="mr-2 h-4 w-4" /> Make private
                        </DropdownMenuItem>
                      )}
                      {isClone && (
                        <>
                          <DropdownMenuItem onClick={() => setPendingPull(t)}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Update from
                            source
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPendingPublish(t)}>
                            <Share2 className="mr-2 h-4 w-4" /> Publish as new
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setPendingArchive(t)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Archive className="mr-2 h-4 w-4" /> Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                  {t.description || "No description."}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                      t.visibility === "public"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-muted-foreground/30 bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.visibility}
                  </span>
                  {isClone && (
                    <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                      {t.origin_author_name
                        ? `Based on ${t.origin_author_name}`
                        : "Cloned"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archive confirm */}
      <Dialog
        open={pendingArchive !== null}
        onOpenChange={(open) => !open && setPendingArchive(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-destructive" />
              Archive template?
            </DialogTitle>
            <DialogDescription>
              &quot;{pendingArchive?.name}&quot; will be removed from this
              library. Existing assignments keep their own snapshot and are
              unaffected.
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
                  void run(
                    () => archiveTemplate(target.id),
                    `Archived "${target.name}".`,
                  );
              }}
            >
              <Archive className="mr-2 h-4 w-4" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pull-from-source confirm */}
      <Dialog
        open={pendingPull !== null}
        onOpenChange={(open) => !open && setPendingPull(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update to the latest version?</DialogTitle>
            <DialogDescription>
              This replaces your current copy of &quot;{pendingPull?.name}&quot;
              with the source template&apos;s latest version. Your local edits
              will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPull(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const target = pendingPull;
                setPendingPull(null);
                if (target)
                  void run(() => pullUpstream(target.id), "Updated from source.");
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish-as-new confirm */}
      <Dialog
        open={pendingPublish !== null}
        onOpenChange={(open) => !open && setPendingPublish(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Publish as a new template?</DialogTitle>
            <DialogDescription>
              This makes &quot;{pendingPublish?.name}&quot; a fresh, public
              template that others can clone via its link. It severs the link to
              the source it was cloned from (the original author stays credited).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPublish(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const target = pendingPublish;
                setPendingPublish(null);
                if (target)
                  void run(
                    () =>
                      publishAsNewTemplate(target.id, { visibility: "public" }),
                    "Published as a new public template.",
                  );
              }}
            >
              <Share2 className="mr-2 h-4 w-4" /> Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
