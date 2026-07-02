"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showSuccessToast } from "@/lib/toast";

import { buildSeedTemplates, cloneSeedDefinition } from "./mockData";
import { TemplateEditor } from "./TemplateEditor";
import type { MockTemplate, Visibility } from "./types";

const VISIBILITY_STYLE: Record<Visibility, string> = {
  private: "border-muted-foreground/30 bg-muted text-muted-foreground",
  public:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

function blankTemplate(): MockTemplate {
  return {
    id: `new-${Date.now()}`,
    name: "",
    description: "",
    ownerScope: "system",
    visibility: "public",
    status: "active",
    definition: cloneSeedDefinition("learning"),
    updatedAt: new Date().toISOString(),
  };
}

type View =
  | { mode: "gallery" }
  | { mode: "edit"; template: MockTemplate; isNew: boolean };

export function SystemTemplateLibrary() {
  const [templates, setTemplates] = useState<MockTemplate[]>(buildSeedTemplates);
  const [view, setView] = useState<View>({ mode: "gallery" });
  const [pendingDelete, setPendingDelete] = useState<MockTemplate | null>(null);

  const handleSave = (next: MockTemplate) => {
    setTemplates((list) => {
      const exists = list.some((t) => t.id === next.id);
      const stamped = { ...next, updatedAt: new Date().toISOString() };
      return exists
        ? list.map((t) => (t.id === next.id ? stamped : t))
        : [...list, stamped];
    });
    showSuccessToast(
      view.mode === "edit" && view.isNew
        ? "Template created (mockup — not persisted)."
        : "Template saved (mockup — not persisted).",
    );
    setView({ mode: "gallery" });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setTemplates((list) => list.filter((t) => t.id !== pendingDelete.id));
    showSuccessToast(`Deleted "${pendingDelete.name}".`);
    setPendingDelete(null);
  };

  if (view.mode === "edit") {
    return (
      <TemplateEditor
        template={view.template}
        isNew={view.isNew}
        onSave={handleSave}
        onCancel={() => setView({ mode: "gallery" })}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/platform"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to platform admin
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">System template library</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The built-in activity types, managed through the same editor every
              library uses. Add, edit, or delete system templates.
            </p>
          </div>
          <Button
            onClick={() =>
              setView({ mode: "edit", template: blankTemplate(), isNew: true })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" /> New template
          </Button>
        </div>
      </header>

      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        UI mockup — no database wiring. Everything is in-memory; reloading the
        page resets to the seeded system templates.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <div
            key={t.id}
            className="group flex flex-col rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() =>
                  setView({ mode: "edit", template: t, isNew: false })
                }
                className="text-left"
              >
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
                  <DropdownMenuItem
                    onClick={() =>
                      setView({ mode: "edit", template: t, isNew: false })
                    }
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPendingDelete(t)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
              {t.description || "No description."}
            </p>

            <div className="mt-4 flex items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${VISIBILITY_STYLE[t.visibility]}`}
              >
                {t.visibility}
              </span>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                System
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirm */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete system template?
            </DialogTitle>
            <DialogDescription>
              This removes &quot;{pendingDelete?.name}&quot; from the system
              library. Existing assignments keep their own snapshot and are
              unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
