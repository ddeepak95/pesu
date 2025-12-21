"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import EditClass from "@/components/Teacher/Classes/EditClass";
import Content from "@/components/Teacher/Classes/Content";
import Students from "@/components/Teacher/Classes/Students";
import ManageTeachersDialog from "@/components/Teacher/Classes/ManageTeachersDialog";
import GroupSettingsDialog from "@/components/Teacher/Classes/GroupSettingsDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId, deleteClass } from "@/lib/queries/classes";
import { Class } from "@/types/class";

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [manageTeachersOpen, setManageTeachersOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);

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

  const fetchClass = async () => {
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
  };

  useEffect(() => {
    if (classId) {
      fetchClass();
    }
  }, [classId]);

  const handleEdit = () => {
    setEditDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!user || !classData) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this class? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      await deleteClass(classData.id, user.id);
      router.push("/teacher/classes");
    } catch (err) {
      console.error("Error deleting class:", err);
      alert("Failed to delete class. Please try again.");
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading class details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !classData) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error || "Class not found"}</p>
        </div>
      </PageLayout>
    );
  }

  const isOwner = user?.id === classData.created_by;

  return (
    <PageLayout>
      <div className="border-b">
        <div className="p-8 pb-0">
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => setManageTeachersOpen(true)}
                    >
                      Manage teachers
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setGroupSettingsOpen(true)}
                    >
                      Group settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleEdit}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem disabled>
                    Owner-only options
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="students">Students</TabsTrigger>
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

      <EditClass
        classData={classData}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onClassUpdated={fetchClass}
      />

      {classData && (
        <ManageTeachersDialog
          classData={classData}
          open={manageTeachersOpen}
          onOpenChange={setManageTeachersOpen}
        />
      )}

      {classData && (
        <GroupSettingsDialog
          classData={classData}
          open={groupSettingsOpen}
          onOpenChange={setGroupSettingsOpen}
          onUpdated={fetchClass}
        />
      )}
    </PageLayout>
  );
}
