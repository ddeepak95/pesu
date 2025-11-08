"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import EditClass from "@/components/Teacher/Classes/EditClass";
import Assignments from "@/components/Teacher/Classes/Assignments";
import Students from "@/components/Teacher/Classes/Students";
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
  const { user } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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

  const handleInviteLink = () => {
    // TODO: Implement invite link feature later
    if (classData) {
      alert(`Invite link feature coming soon! Class ID: ${classData.class_id}`);
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

  return (
    <PageLayout>
      <div className="border-b">
        <div className="p-8 pb-0">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleInviteLink}>
                  Invite Link
                </DropdownMenuItem>
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

          <Tabs defaultValue="assignments" className="w-full">
            <TabsList>
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
              <TabsTrigger value="students">Students</TabsTrigger>
            </TabsList>

            <TabsContent value="assignments">
              <Assignments classData={classData} />
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
    </PageLayout>
  );
}

