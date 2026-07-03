import Link from "next/link";
import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { TemplateLibrary } from "@/components/Teacher/Templates/TemplateLibrary";
import { verifySession } from "@/lib/dal";
import { listClassTemplates } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Class Templates",
};

/**
 * The class-owned template library (§7.1) — co-editable by any co-teacher of
 * the class. Reached from the class settings "Activity Types" section. Class
 * templates are automatically in the class palette (no "add" step needed).
 */
export default async function ClassTemplatesPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { user, supabase } = await verifySession("/teacher/login");

  const { data: classData } = await supabase
    .from("classes")
    .select("id, name")
    .eq("class_id", classId)
    .in("status", ["active", "archived"])
    .single();
  if (!classData) notFound();

  // Any co-teacher of the class may manage its templates (RLS enforces writes).
  const { data: membership } = await supabase
    .from("class_teachers")
    .select("teacher_id")
    .eq("class_id", classData.id)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  const templates = await listClassTemplates(classData.id, supabase);

  return (
    <PageLayout>
      <div className="space-y-4">
        <Link
          href={`/teacher/classes/${classId}/settings`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Class settings
        </Link>
        <TemplateLibrary
          owner={{ scope: "class", classId: classData.id }}
          initialTemplates={templates}
          title={`Class Templates · ${classData.name}`}
          description="Templates owned by this class, co-editable by all co-teachers. These are automatically available to select when building an assignment in this class."
        />
      </div>
    </PageLayout>
  );
}
