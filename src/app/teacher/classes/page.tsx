"use client";

import { useEffect, useState, useCallback } from "react";
import PageLayout from "@/components/PageLayout";
import InnerPageLayout from "@/components/Layout/InnerPageLayout";
import CreateClass from "@/components/Teacher/Classes/CreateClass";
import ClassCard from "@/components/Teacher/Classes/ClassCard";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { getClassesByUser, deleteClass } from "@/lib/queries/classes";
import { Class } from "@/types/class";

export default function ClassesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClasses = useCallback(async () => {
    if (!user) {
      console.log("No user logged in");
      setLoading(false);
      return;
    }

    console.log("User logged in:", user.id, user.email);
    setLoading(true);
    setError(null);

    try {
      const data = await getClassesByUser(user.id);
      setClasses(data);
    } catch (err) {
      console.error("Error fetching classes:", err);
      setError("Failed to load classes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleDelete = async (classId: string) => {
    if (!user) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this class? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      await deleteClass(classId, user.id);
      // Refresh the list after deletion
      await fetchClasses();
    } catch (err) {
      console.error("Error deleting class:", err);
      alert("Failed to delete class. Please try again.");
    }
  };

  const handleInviteLink = (classId: string) => {
    // TODO: Implement invite link feature later
    alert(`Invite link feature coming soon! Class ID: ${classId}`);
  };

  return (
    <PageLayout>
      <InnerPageLayout
        title="Classes"
        action={<CreateClass onClassCreated={fetchClasses} />}
      >
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading classes...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive">{error}</p>
          </div>
        ) : (
          <List
            items={classes}
            renderItem={(classItem) => (
              <ClassCard
                key={classItem.id}
                classData={classItem}
                onDelete={handleDelete}
                onInviteLink={handleInviteLink}
              />
            )}
            emptyMessage="No classes yet. Create your first class to get started!"
          />
        )}
      </InnerPageLayout>
    </PageLayout>
  );
}
