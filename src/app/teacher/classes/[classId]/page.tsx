"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import Content from "@/components/Teacher/Classes/Content";
import Students from "@/components/Teacher/Classes/Students";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";
import { Settings } from "lucide-react";

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeTab = useMemo(() => {
    const t = searchParams.get("tab");
    return t === "students" ? "students" : "content";
  }, [searchParams]);

  const replaceQuery = (
    nextTab: "content" | "students",
    nextGroupId?: string | null
  ) => {
    // Maintain param order: tab first, then groupId, then everything else.
    const current = new URLSearchParams(searchParams.toString());
    current.delete("tab");
    current.delete("groupId");

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

  // Ensure tab exists (and comes first). If URL has only groupId, normalize to tab=content&groupId=...
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "content" || t === "students") return;
    replaceQuery("content", searchParams.get("groupId"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchClass = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getClassByClassId(classId);
      if (!data) {
        setError("Class not found");
      } else {
        setClassData(data);
      }
    } catch (err) {
      console.error("Error fetching class:", err);
      setError("Failed to load class details");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (classId) {
      fetchClass();
    }
  }, [classId, fetchClass]);

  // Show loading while checking auth (middleware handles redirect if not authenticated)
  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading class details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !classData) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Class not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            {user.id === classData.created_by && (
              <Button variant="outline" className="gap-2" asChild>
                <Link href={`/teacher/classes/${classId}/settings`}>
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </Button>
            )}
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const nextTab = v === "students" ? "students" : "content";
              // Students tab should not carry groupId.
              replaceQuery(
                nextTab,
                nextTab === "content" ? searchParams.get("groupId") : null
              );
            }}
            className="w-full"
          >
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="content"
                className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Content
              </TabsTrigger>
              <TabsTrigger
                value="students"
                className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Students
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content">
              <Content classData={classData} />
            </TabsContent>

            <TabsContent value="students">
              <Students classData={classData} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
