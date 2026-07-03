"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TemplateEditor } from "@/components/Platform/Templates/TemplateEditor";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type {
  ActivityTemplateRow,
  TemplateOwnerScope,
} from "@/lib/queries/activityTemplates";

import { rowToMockTemplate } from "./adapters";

const SCOPE_LABEL: Record<TemplateOwnerScope, string> = {
  system: "Platform",
  institution: "Institution",
  class: "Class",
  user: "Personal",
};

/**
 * Scope-neutral, read-only rendering of a template. Reuses `TemplateEditor` in
 * `readOnly` mode (no sticky footer) so a viewed template reads identically to
 * how its author edits it. Shared by the preview page
 * (`/activity-templates/[id]/preview`) and the in-list View dialog — neither
 * carries any library-specific chrome (no "My Templates" back-link or clone
 * actions).
 */
export function TemplateReadOnly({
  template,
}: {
  template: ActivityTemplateRow;
}) {
  const mock = rowToMockTemplate(template);
  const [copied, setCopied] = useState(false);

  async function copyShareLink() {
    try {
      const url = `${window.location.origin}/activity-templates/${template.id}/preview`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showSuccessToast("Share link copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showErrorToast("Couldn't copy the link.");
    }
  }

  const header = (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        {template.visibility === "public" && (
          <Button
            variant="outline"
            size="sm"
            onClick={copyShareLink}
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Link2 className="mr-1.5 h-3.5 w-3.5" /> Share link
              </>
            )}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        A read-only view of everything this activity type configures for the AI
        conversation, evaluation, and question-generation behavior.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-3">
        <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {SCOPE_LABEL[template.owner_scope]}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
            template.visibility === "public"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-muted-foreground/30 bg-muted text-muted-foreground"
          }`}
        >
          {template.visibility}
        </span>
        {template.origin_author_name && (
          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400">
            Based on {template.origin_author_name}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <TemplateEditor
      template={mock}
      isNew={false}
      readOnly
      header={header}
      ownerLabel={SCOPE_LABEL[template.owner_scope]}
    />
  );
}
