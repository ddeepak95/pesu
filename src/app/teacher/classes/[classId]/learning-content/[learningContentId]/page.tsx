import { cache } from "react";
import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import LearningContentDetailClient from "./LearningContentDetailClient";

const LC_ALL_COLUMNS =
  "id, learning_content_id, class_id, class_group_id, title, content_type, video_url, body, created_by, created_at, updated_at, status";

const getLearningContentData = cache(async (learningContentId: string) => {
  const { supabase } = await verifySession("/teacher/login");

  const { data } = await supabase
    .from("learning_contents")
    .select(LC_ALL_COLUMNS)
    .eq("learning_content_id", learningContentId)
    .in("status", ["active", "draft"])
    .single();

  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ learningContentId: string }>;
}) {
  const { learningContentId } = await params;
  const contentData = await getLearningContentData(learningContentId);
  return { title: contentData?.title ?? "Learning Content" };
}

export default async function LearningContentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; learningContentId: string }>;
}) {
  const { classId, learningContentId } = await params;
  const contentData = await getLearningContentData(learningContentId);

  if (!contentData) notFound();

  return (
    <LearningContentDetailClient
      initialContent={contentData}
      classId={classId}
    />
  );
}
