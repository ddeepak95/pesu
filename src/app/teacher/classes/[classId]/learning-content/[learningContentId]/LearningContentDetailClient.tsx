"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import {
  updateLearningContent,
  deleteLearningContent,
} from "@/lib/queries/learningContent";
import {
  softDeleteContentItemByRef,
  updateContentItemStatusByRef,
} from "@/lib/queries/contentItems";
import { LearningContent } from "@/types/learningContent";
import LearningContentViewer from "@/components/Shared/LearningContentViewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LearningContentCompletionsTab from "@/components/Teacher/LearningContent/LearningContentCompletionsTab";
import { showErrorToast } from "@/lib/toast";

interface LearningContentDetailClientProps {
  initialContent: LearningContent;
  classId: string;
}

export default function LearningContentDetailClient({
  initialContent,
  classId,
}: LearningContentDetailClientProps) {
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const learningContentId = initialContent.learning_content_id;
  const [content, setContent] = useState<LearningContent>(initialContent);

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
      showErrorToast("Failed to delete learning content. Please try again.");
    }
  };

  const handlePublish = async () => {
    if (!content) return;

    try {
      const updated = await updateLearningContent(content.id, {
        title: content.title,
        video_url: content.video_url,
        body: content.body,
        status: "active",
      });

      await updateContentItemStatusByRef({
        class_id: content.class_id,
        type: "learning_content",
        ref_id: content.id,
        status: updated.status,
      });

      setContent(updated);
    } catch (err) {
      console.error("Error publishing learning content:", err);
      showErrorToast("Failed to publish learning content. Please try again.");
    }
  };

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <PageTitle title={content.title} />
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p className="capitalize">Status: {content.status}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {content.status === "draft" && (
                  <DropdownMenuItem onClick={handlePublish}>
                    Publish
                  </DropdownMenuItem>
                )}
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

          <Tabs defaultValue="content" className="w-full">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="completions">Completions</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="py-6">
              <div className="space-y-6 pb-8">
                <LearningContentViewer
                  title={content.title}
                  body={content.body}
                  videoUrl={content.video_url}
                />
              </div>
            </TabsContent>

            <TabsContent value="completions" className="py-6">
              <LearningContentCompletionsTab content={content} classId={classId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
