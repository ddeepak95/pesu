"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { TemplateEditor } from "@/components/Platform/Templates/TemplateEditor";
import { cloneSeedDefinition } from "@/components/Platform/Templates/mockData";
import type { MockTemplate } from "@/components/Platform/Templates/types";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";
import { invalidateActivityTemplatesCache } from "@/hooks/swr";
import {
  createTemplate,
  setTemplateVisibility,
  updateTemplate,
} from "@/lib/templates/actions";
import {
  fromEditorDefinition,
  rowToMockTemplate,
} from "@/components/Teacher/Templates/adapters";

const CLASS_BADGE = (
  <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
    Class library · co-editable
  </span>
);

function blankClassTemplate(): MockTemplate {
  return {
    id: `new-${Date.now()}`,
    name: "",
    description: "",
    ownerScope: "class",
    visibility: "private",
    status: "active",
    definition: cloneSeedDefinition("learning"),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Full-page create/edit surface for a class-owned activity template. Only
 * class-owned templates are editable in place (Platform/Institution/Personal
 * are cloned into the class first), so this component always writes with
 * `scope: "class"`. Save/cancel navigate back to the class Manage page.
 */
export function ClassTemplateEditor({
  classDbId,
  classShortId,
  template,
}: {
  classDbId: string;
  classShortId: string;
  template?: ActivityTemplateRow;
}) {
  const router = useTrackedRouter();
  const isNew = !template;
  const [saving, setSaving] = useState(false);
  const original = template?.definition ?? null;
  const initial = template ? rowToMockTemplate(template) : blankClassTemplate();

  const backHref = `/teacher/classes/${classShortId}/settings/activity-templates`;

  async function handleSave(next: MockTemplate) {
    setSaving(true);
    try {
      const definition = fromEditorDefinition(next.definition, original);
      if (isNew) {
        await createTemplate({
          scope: "class",
          classId: classDbId,
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
      showSuccessToast(isNew ? "Activity type created." : "Changes saved.");
      router.push(backHref);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  }

  const header = (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={() => router.push(backHref)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to activity templates
        </button>
        {CLASS_BADGE}
      </div>
      <div>
        <h1 className="text-2xl font-semibold">
          {isNew ? "Create class activity type" : `Edit · ${template!.name}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything this activity type configures for the AI conversation,
          evaluation, and question-generation behavior. Owned by this class and
          co-editable by all co-teachers.
        </p>
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
      ownerLabel="This class (co-editable by co-teachers)"
      newTitle="Create class activity type"
      footerNote={null}
    />
  );
}
