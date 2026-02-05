"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLearningContentByShortIdForTeacher,
  deleteLearningContent,
} from "@/lib/queries/learningContent";
import { softDeleteContentItemByRef } from "@/lib/queries/contentItems";
import { LearningContent } from "@/types/learningContent";
import LearningContentViewer from "@/components/Shared/LearningContentViewer";

export default function LearningContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const classId = params.classId as string;
  const learningContentId = params.learningContentId as string;

  const [content, setContent] = useState<LearningContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLearningContentByShortIdForTeacher(
        learningContentId
      );
      if (!data) setError("Learning content not found");
      else setContent(data);
    } catch (err) {
      console.error("Error fetching learning content:", err);
      setError("Failed to load learning content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (learningContentId) fetchContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningContentId]);

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/learning-content/${learningContentId}/edit${
        qs ? `?${qs}` : ""
      }`
    );
  };

  const handleDelete = async () => {
    if (!user || !content) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this learning content? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      await deleteLearningContent(content.id);
      await softDeleteContentItemByRef({
        class_id: content.class_id,
        type: "learning_content",
        ref_id: content.id,
      });
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting learning content:", err);
      alert("Failed to delete learning content. Please try again.");
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading learning content…</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !content) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton href={`/teacher/classes/${classId}`} />
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">{content.title}</h1>
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p className="capitalize">Status: {content.status}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-6 pb-8">
            <LearningContentViewer
              title={content.title}
              body={content.body}
              videoUrl={content.video_url}
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
