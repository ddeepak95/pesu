"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Pencil } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";

import { Button } from "@/components/ui/button";
import { TemplateEditor } from "@/components/Platform/Templates/TemplateEditor";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cloneTemplate } from "@/lib/templates/actions";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";

import { rowToMockTemplate } from "./adapters";

/**
 * Read-only view of a template (§7.5, §9 of dev-docs/activity-templates-plan.md).
 *
 * Renders the exact same layout and information flow as the editor
 * (`Platform/Templates/TemplateEditor`) via its `readOnly` mode, so a shared/
 * viewed template reads identically to how its author edits it — every card,
 * heading, and field in the same order — just uneditable and without the
 * validate/save footer. A custom header supplies the share chrome (visibility /
 * scope / origin chips and the Clone / Edit action).
 */
export function TemplateDetail({
  template,
  isOwner,
}: {
  template: ActivityTemplateRow;
  isOwner: boolean;
}) {
  const router = useTrackedRouter();
  const [cloning, setCloning] = useState(false);
  const mock = rowToMockTemplate(template);

  async function handleClone() {
    setCloning(true);
    try {
      await cloneTemplate({ sourceId: template.id, destScope: "user" });
      showSuccessToast("Cloned to your library.");
      router.push("/teacher/activity-templates");
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Could not clone.");
      setCloning(false);
    }
  }

  const ownerLabel = isOwner
    ? "You"
    : template.origin_author_name
      ? `${template.origin_author_name} (via a shared link)`
      : `${template.owner_scope} template`;

  const header = (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Link
          href="/teacher/activity-templates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My Templates
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {isOwner ? (
            <Button asChild variant="outline">
              <Link href="/teacher/activity-templates">
                <Pencil className="mr-1.5 h-4 w-4" /> Edit in My Templates
              </Link>
            </Button>
          ) : (
            <Button onClick={() => void handleClone()} disabled={cloning}>
              <Copy className="mr-1.5 h-4 w-4" />
              {cloning ? "Cloning…" : "Clone to my library"}
            </Button>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A read-only view of everything this template configures for the AI
          conversation, evaluation, and question-generation behavior.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
              template.visibility === "public"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-muted-foreground/30 bg-muted text-muted-foreground"
            }`}
          >
            {template.visibility}
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
            {template.owner_scope} template
          </span>
          {template.origin_author_name && (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
              Based on {template.origin_author_name}
            </span>
          )}
        </div>
      </div>

      {!isOwner && (
        <p className="rounded-md border border-dashed bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          Cloning makes an editable copy you own. It never changes this original,
          and the original author stays credited.
        </p>
      )}
    </div>
  );

  return (
    <TemplateEditor
      template={mock}
      isNew={false}
      readOnly
      header={header}
      ownerLabel={ownerLabel}
    />
  );
}
