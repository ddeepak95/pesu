"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Class } from "@/types/class";
import { Assignment } from "@/types/assignment";
import { Button } from "@/components/ui/button";
import List from "@/components/ui/List";
import AssignmentCard from "@/components/Teacher/Assignments/AssignmentCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssignmentsByClassForTeacher,
  deleteAssignment,
} from "@/lib/queries/assignments";

interface AssignmentsProps {
  classData: Class;
}

export default function Assignments({ classData }: AssignmentsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    if (!classData.id) {
      console.log("No class ID available");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getAssignmentsByClassForTeacher(classData.id);
      setAssignments(data);
    } catch (err) {
      console.error("Error fetching assignments:", err);
      setError("Failed to load assignments. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [classData.id]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleDelete = async (assignmentId: string) => {
    if (!user) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this assignment? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      await deleteAssignment(assignmentId, classData.id);
      // Refresh the list after deletion
      await fetchAssignments();
    } catch (err) {
      console.error("Error deleting assignment:", err);
      alert("Failed to delete assignment. Please try again.");
    }
  };

  const handleEdit = (assignment: Assignment) => {
    router.push(
      `/teacher/classes/${classData.class_id}/assignments/${assignment.assignment_id}/edit`
    );
  };

  const handleCopyLink = (assignmentId: string) => {
    // TODO: Implement copy link functionality
    const link = `${window.location.origin}/assignment/${assignmentId}`;
    navigator.clipboard.writeText(link);
    alert(`Link copied to clipboard: ${link}`);
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
              onCopyLink={handleCopyLink}
              onClick={handleAssignmentClick}
            />
          )}
          emptyMessage="No assignments yet. Create your first assignment to get started!"
        />
      )}
    </div>
  );
}
