"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Pencil } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";

import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/ui/settings-card";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cloneTemplate } from "@/lib/templates/actions";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";

/** One labelled, read-only block of prompt text (omitted when empty). */
function PreviewBlock({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <h5 className="text-sm font-semibold text-foreground">{label}</h5>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

export function TemplateDetail({
  template,
  isOwner,
}: {
  template: ActivityTemplateRow;
  isOwner: boolean;
}) {
  const router = useTrackedRouter();
  const [cloning, setCloning] = useState(false);
  const def = template.definition;

  async function handleClone() {
    setCloning(true);
    try {
      await cloneTemplate({ sourceId: template.id, destScope: "user" });
      showSuccessToast("Cloned to your library.");
      router.push("/teacher/templates");
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Could not clone.");
      setCloning(false);
    }
  }

  const actions = def.defaults?.multimodal?.availableActions ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> My Templates
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          {template.description && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {template.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
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
        <div className="flex shrink-0 items-center gap-2">
          {isOwner ? (
            <Button asChild variant="outline">
              <Link href="/teacher/templates">
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
      </header>

      {!isOwner && (
        <p className="rounded-md border border-dashed bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          Cloning makes an editable copy you own. It never changes this original,
          and the original author stays credited.
        </p>
      )}

      <SettingsCard className="space-y-5">
        <h4 className="text-base font-semibold">What this template configures</h4>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded border bg-muted/40 px-2 py-1 text-muted-foreground">
            Interaction: {def.defaults?.interactionType ?? "multimodal"}
          </span>
          <span className="rounded border bg-muted/40 px-2 py-1 text-muted-foreground">
            Actions: {actions.length ? actions.join(", ") : "none"}
          </span>
          <span className="rounded border bg-muted/40 px-2 py-1 text-muted-foreground">
            Bulb: {def.bulbAction ?? "none"}
          </span>
          <span className="rounded border bg-muted/40 px-2 py-1 text-muted-foreground">
            Language support:{" "}
            {def.defaults?.multimodal?.languageSupportEnabled ? "on" : "off"}
          </span>
          <span className="rounded border bg-muted/40 px-2 py-1 text-muted-foreground">
            File submission:{" "}
            {def.defaults?.fileSubmission?.required ? "required" : "optional"}
          </span>
        </div>

        <PreviewBlock label="Conversation system prompt" value={def.systemPrompt} />
        <PreviewBlock
          label="First-question greeting"
          value={def.conversationStart?.first_question}
        />
        <PreviewBlock
          label="Subsequent-question greeting"
          value={def.conversationStart?.subsequent_questions}
        />
        <PreviewBlock label="Action directive" value={def.actionDirective} />
        <PreviewBlock
          label="Language support directive"
          value={def.languageSupportDirective}
        />
        <PreviewBlock
          label="Conversation end condition"
          value={def.endConditionInstruction}
        />
        <PreviewBlock
          label="Evaluator persona"
          value={def.evaluationSystemPersona}
        />
        <PreviewBlock label="Evaluation prompt" value={def.evaluationPrompt} />
      </SettingsCard>
    </div>
  );
}
