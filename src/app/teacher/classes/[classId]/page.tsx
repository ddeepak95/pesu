import { Suspense } from "react";
import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import ClassDetailClient from "@/app/teacher/classes/[classId]/ClassDetailClient";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id";

function ClassDetailFallback() {
  return (
    <PageLayout>
      <div className="py-12 text-center text-muted-foreground">Loading class…</div>
    </PageLayout>
  );
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { supabase } = await verifySession("/teacher/login");

  const { data: classData } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .in("status", ["active", "archived"])
    .single();

  if (!classData) notFound();

  return (
    <Suspense fallback={<ClassDetailFallback />}>
      <ClassDetailClient classData={classData} classId={classId} />
    </Suspense>
  );
}
