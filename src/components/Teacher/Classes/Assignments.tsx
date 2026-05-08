"use client";

import { useState, useMemo } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { mutate } from "swr";
import { Class } from "@/types/class";
import { Assignment } from "@/types/assignment";
import { Button } from "@/components/ui/button";
import List from "@/components/ui/List";
import AssignmentCard from "@/components/Teacher/Assignments/AssignmentCard";
import { AssignmentLinkShare } from "@/components/Teacher/Assignments/AssignmentLinkShare";
import { useAuth } from "@/contexts/AuthContext";
import { deleteAssignment } from "@/lib/queries/assignments";
import { showErrorToast } from "@/lib/toast";
import { useAssignmentsByClassForTeacher } from "@/hooks/swr";

interface AssignmentsProps {
  classData: Class;
}

export default function Assignments({ classData }: AssignmentsProps) {
  const router = useTrackedRouter();
  const { user } = useAuth();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const assignmentsQuery = useAssignmentsByClassForTeacher(classData.id ?? null);
  const assignments = useMemo(
    () => assignmentsQuery.data ?? [],
    [assignmentsQuery.data]
  );
  const loading = assignmentsQuery.isLoading;
  const error = assignmentsQuery.error
    ? "Failed to load assignments. Please try again."
    : null;

  const handleDelete = async (assignmentId: string) => {
    if (!user) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this assignment? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      await deleteAssignment(assignmentId, classData.id);
      await mutate(["assignmentsByClassTeacher", classData.id]);
    } catch (err) {
      console.error("Error deleting assignment:", err);
      showErrorToast("Failed to delete assignment. Please try again.");
    }
  };

  const handleEdit = (assignment: Assignment) => {
    router.push(
      `/teacher/classes/${classData.class_id}/assignments/${assignment.assignment_id}/edit`
    );
  };

  const handleShareLinks = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShareDialogOpen(true);
  };

  const handleCreateAssignment = () => {
    router.push(`/teacher/classes/${classData.class_id}/assignments/create`);
  };

  const handleAssignmentClick = (assignment: Assignment) => {
    router.push(
      `/teacher/classes/${classData.class_id}/assignments/${assignment.assignment_id}`
    );
  };

  return (
    <div className="py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Assignments</h2>
        <Button onClick={handleCreateAssignment}>Create Assignment</Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading assignments...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      ) : (
        <List
          items={assignments}
          renderItem={(assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onShareLinks={handleShareLinks}
              onClick={handleAssignmentClick}
            />
          )}
          emptyMessage="No assignments yet. Create your first assignment to get started!"
        />
      )}

      {selectedAssignment && (
        <AssignmentLinkShare
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          assignmentId={selectedAssignment.assignment_id}
          classId={classData.class_id}
          isPublic={selectedAssignment.is_public}
        />
      )}
    </div>
  );
}
