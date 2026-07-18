"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import AiConfigMisconfigBanner from "@/components/Settings/AiConfig/AiConfigMisconfigBanner";
import { ArchivedClassBanner } from "@/components/Shared/ArchivedClassBanner";
import { ClassCreditsBanner } from "@/components/Shared/ClassCreditsBanner";
import Content from "@/components/Teacher/Classes/Content";
import Students from "@/components/Teacher/Classes/Students";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";
import { Class } from "@/types/class";
import { useMyClassTeacherRole } from "@/hooks/swr";
import { canConfigureClassSettings } from "@/lib/classTeacherAccess";
import { useAuth } from "@/contexts/AuthContext";

interface ClassDetailClientProps {
  classData: Class;
  classId: string;
  /** Content types this class may create (institution default → class override). */
  allowedContentTypes: string[];
  /** Whether the Students → Analytics sub-tab is visible for this class. */
  showAnalyticsTab: boolean;
}

export default function ClassDetailClient({
  classData,
  classId,
  allowedContentTypes,
  showAnalyticsTab,
}: ClassDetailClientProps) {
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { data: myRole } = useMyClassTeacherRole(classData.id, user?.id ?? null);
  const showSettingsLink = canConfigureClassSettings(myRole ?? null);

  const activeTab = useMemo(() => {
    const t = searchParams.get("tab");
    return t === "students" ? "students" : "content";
  }, [searchParams]);

  const replaceQuery = (
    nextTab: "content" | "students",
    nextGroupId?: string | null,
  ) => {
    const current = new URLSearchParams(searchParams.toString());
    current.delete("tab");
    current.delete("groupId");
    if (nextTab === "content") {
      current.delete("studentsTab");
    }

    const ordered = new URLSearchParams();
    ordered.set("tab", nextTab);
    if (nextTab === "content" && nextGroupId) {
      ordered.set("groupId", nextGroupId);
    }

    for (const [k, v] of current.entries()) {
      ordered.append(k, v);
    }

    router.replace(`?${ordered.toString()}`);
  };

  // Restore scroll position when navigating back from a content page
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`scroll_${classId}`);
      if (raw != null) {
        const y = Number(raw);
        sessionStorage.removeItem(`scroll_${classId}`);
        requestAnimationFrame(() => {
          setTimeout(() => window.scrollTo(0, y), 50);
        });
      }
    } catch {}
  }, [classId]);

  // Ensure tab exists in URL
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "content" || t === "students") return;
    replaceQuery("content", searchParams.get("groupId"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <Button variant="link" asChild className="p-0">
              <Link href="/teacher/classes">&larr; All Classes</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            {showSettingsLink && (
              <Button variant="outline" className="gap-2" asChild>
                <Link href={`/teacher/classes/${classId}/settings`}>
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </Button>
            )}
          </div>

          {classData.status === "archived" && (
            <div className="mb-6">
              <ArchivedClassBanner />
            </div>
          )}

          {classData.institution_id && (
            <div className="mb-6">
              <AiConfigMisconfigBanner
                classDbId={classData.id}
                institutionId={classData.institution_id}
              />
            </div>
          )}

          <div className="mb-6">
            <ClassCreditsBanner
              classDbId={classData.id}
              settingsHref={`/teacher/classes/${classId}/settings?settingsTab=ai`}
            />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const nextTab = v === "students" ? "students" : "content";
              replaceQuery(
                nextTab,
                nextTab === "content" ? searchParams.get("groupId") : null,
              );
            }}
            className="w-full overflow-visible"
          >
            <TabsList className="h-auto w-full justify-start rounded-none border-b border-[var(--class-underline-tab-rule)] bg-transparent p-0">
              <TabsTrigger
                value="content"
                className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
              >
                Content
              </TabsTrigger>
              <TabsTrigger
                value="students"
                className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
              >
                Students
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content">
              <Content
                classData={classData}
                allowedContentTypes={allowedContentTypes}
              />
            </TabsContent>

            <TabsContent value="students" className="overflow-visible">
              <Students
                classData={classData}
                showAnalyticsTab={showAnalyticsTab}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
