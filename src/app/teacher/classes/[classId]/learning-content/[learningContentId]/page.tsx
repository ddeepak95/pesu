import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import LearningContentDetailClient from "./LearningContentDetailClient";

const LC_ALL_COLUMNS =
  "id, learning_content_id, class_id, class_group_id, title, content_type, video_url, body, created_by, created_at, updated_at, status";

export default async function LearningContentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; learningContentId: string }>;
}) {
  const { classId, learningContentId } = await params;
  const { supabase } = await verifySession("/teacher/login");

  const { data: contentData } = await supabase
    .from("learning_contents")
    .select(LC_ALL_COLUMNS)
    .eq("learning_content_id", learningContentId)
    .in("status", ["active", "draft"])
    .single();

  if (!contentData) notFound();

  return (
    <LearningContentDetailClient
      initialContent={contentData}
      classId={classId}
    />
  );
}
