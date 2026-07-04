"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { TemplateEditor } from "@/components/Platform/Templates/TemplateEditor";
import { cloneSeedDefinition } from "@/components/Platform/Templates/mockData";
import type { MockTemplate } from "@/components/Platform/Templates/types";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";
import {
  createTemplate,
  setTemplateVisibility,
  updateTemplate,
} from "@/lib/templates/actions";
import { invalidateActivityTemplatesCache } from "@/hooks/swr";

import { fromEditorDefinition, rowToMockTemplate } from "@/components/Teacher/Templates/adapters";

function blankSystemTemplate(): MockTemplate {
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

/**
 * Full-page create/edit surface for a system (platform) activity template —
 * the platform-admin counterpart to `Teacher/Templates/UserTemplateEditor`.
 * Save/cancel navigate back to the platform template library.
 */
export function SystemTemplateEditor({
  template,
}: {
  template?: ActivityTemplateRow;
}) {
  const router = useTrackedRouter();
  const isNew = !template;
  const [saving, setSaving] = useState(false);
  const original = template?.definition ?? null;
  const initial = template ? rowToMockTemplate(template) : blankSystemTemplate();

  const backHref = "/platform/activity-templates";

  async function handleSave(next: MockTemplate) {
    setSaving(true);
    try {
      const definition = fromEditorDefinition(next.definition, original);
      if (isNew) {
        await createTemplate({
          scope: "system",
          name: next.name,
          description: next.description || null,
          visibility: next.visibility,
          definition,
        });
      } else {
        await updateTemplate(template!.id, {
          name: next.name,
          description: next.description || null,
          definition,
        });
        if (template!.visibility !== next.visibility) {
          await setTemplateVisibility(template!.id, next.visibility);
        }
      }
      await invalidateActivityTemplatesCache();
      showSuccessToast(isNew ? "Template created." : "Template saved.");
      router.push(backHref);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  }

  const header = (
    <div className="space-y-6">
      <button
        onClick={() => router.push(backHref)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to System template library
      </button>
      <div>
        <h1 className="text-2xl font-semibold">
          {isNew ? "New system template" : `Edit · ${template!.name}`}
        </h1>
      </div>
    </div>
  );

  return (
    <TemplateEditor
      template={initial}
      isNew={isNew}
      saving={saving}
      onSave={handleSave}
      onCancel={() => router.push(backHref)}
      header={header}
      ownerLabel="Platform (system library)"
      newTitle="New system template"
      footerNote={null}
    />
  );
}
