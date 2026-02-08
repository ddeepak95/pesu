"use client";

import PageLayout from "@/components/PageLayout";
import InnerPageLayout from "@/components/Layout/InnerPageLayout";
import ClassCard from "@/components/Student/Classes/ClassCard";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { useClassesByStudent } from "@/hooks/swr";

export default function ClassesPage() {
  const { user, loading: authLoading } = useAuth();

  const { data: classes = [], error: classesError, isLoading: classesLoading } =
    useClassesByStudent(user?.id ?? null);

  const loading = classesLoading;
  const error = classesError?.message ?? null;

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
