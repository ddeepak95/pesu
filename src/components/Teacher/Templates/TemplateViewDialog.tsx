"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";

import { TemplateReadOnly } from "./TemplateReadOnly";

/**
 * Read-only quick-look at a template inside a dialog (the in-list "View"
 * action). Full authoring lives on its own route; this is just a look. Reuses
 * the same `TemplateReadOnly` renderer as the preview page.
 */
export function TemplateViewDialog({
  template,
  open,
  onOpenChange,
}: {
  template: ActivityTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{template?.name ?? "Template"}</DialogTitle>
        </DialogHeader>
        {template && <TemplateReadOnly template={template} />}
      </DialogContent>
    </Dialog>
  );
}
