"use client";

import { useEffect, useState, useCallback } from "react";
import PageLayout from "@/components/PageLayout";
import InnerPageLayout from "@/components/Layout/InnerPageLayout";
import ClassCard from "@/components/Student/Classes/ClassCard";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { getClassesByStudent } from "@/lib/queries/classes";
import { Class } from "@/types/class";

export default function ClassesPage() {
  const { user, loading: authLoading } = useAuth();
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
      const data = await getClassesByStudent(user.id);
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

  // Show loading while checking auth (middleware handles redirect if not authenticated)
  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <InnerPageLayout title="My Classes">
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
              <ClassCard key={classItem.id} classData={classItem} />
            )}
            emptyMessage="No classes yet. You'll see classes here once you're enrolled."
          />
        )}
      </InnerPageLayout>
    </PageLayout>
  );
}

