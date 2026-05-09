"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import {
  buildTeacherDetailHrefWithTab,
  resolveTeacherDetailTabParam,
} from "@/lib/teacherDetailTabUrl";
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
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import { countContentItemPlacementsByRefTracked } from "@/lib/swr/imperativeReads";
import { resolveTeacherPlacementGroupId } from "@/lib/contentPlacements";
import { removeTeacherMaterialPlacementOrEntity } from "@/lib/teacherMaterialRemove";
import { LearningContent } from "@/types/learningContent";
import LearningContentViewer from "@/components/Shared/LearningContentViewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LearningContentCompletionsTab from "@/components/Teacher/LearningContent/LearningContentCompletionsTab";
import { showErrorToast } from "@/lib/toast";
import { useMaterialLinkedAcrossGroups } from "@/hooks/swr";

interface LearningContentDetailClientProps {
  initialContent: LearningContent;
  classId: string;
}

const LEARNING_DETAIL_TABS = ["content", "completions"] as const;

export default function LearningContentDetailClient({
  initialContent,
  classId,
}: LearningContentDetailClientProps) {
  const router = useTrackedRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const learningContentId = initialContent.learning_content_id;
  const [content, setContent] = useState<LearningContent>(initialContent);

  const placementGroupId = useMemo(
    () => resolveTeacherPlacementGroupId(searchParams.get("groupId"), content.class_group_id),
    [searchParams, content.class_group_id]
  );

  const activeLearningTab = useMemo(
    () =>
      resolveTeacherDetailTabParam(searchParams.get("tab"), {
        allowedTabs: LEARNING_DETAIL_TABS,
        defaultTab: "content",
      }),
    [searchParams]
  );

  const setLearningTab = (value: string) => {
    router.replace(
      buildTeacherDetailHrefWithTab(pathname, searchParams, value, {
        allowedTabs: LEARNING_DETAIL_TABS,
        defaultTab: "content",
      }),
      { scroll: false }
    );
  };

  const isLinkedAcrossGroups = useMaterialLinkedAcrossGroups(
    content.class_id,
    "learning_content",
    content.id
  );

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

    let placementCount = 1;
    try {
      placementCount = await countContentItemPlacementsByRefTracked({
        classId: content.class_id,
        type: "learning_content",
        refId: content.id,
      });
    } catch (e) {
      console.error(e);
      showErrorToast("Could not verify placements. Please try again.");
      return;
    }

    const confirmed = window.confirm(
      placementCount > 1
        ? "This item is linked in more than one group. Remove it only from this group's feed? Open from Class Content with the correct group tab if unsure."
        : "Are you sure you want to delete this learning content? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      await removeTeacherMaterialPlacementOrEntity({
        classDbId: content.class_id,
        type: "learning_content",
        refId: content.id,
        placementGroupId,
        deleteEntitySoft: () => deleteLearningContent(content.id),
      });
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting learning content:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to delete learning content. Please try again.";
      showErrorToast(msg);
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
              <PageTitle title={content.title} isLinked={isLinkedAcrossGroups} />
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

          <Tabs
            value={activeLearningTab}
            onValueChange={setLearningTab}
            className="w-full"
          >
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
              <LearningContentCompletionsTab
                content={content}
                classId={classId}
                placementGroupId={placementGroupId}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
