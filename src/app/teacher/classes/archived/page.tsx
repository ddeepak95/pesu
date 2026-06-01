"use client";

import PageLayout from "@/components/PageLayout";
import InnerPageLayout from "@/components/Layout/InnerPageLayout";
import BackButton from "@/components/ui/back-button";
import ClassCard from "@/components/Teacher/Classes/ClassCard";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { useArchivedClassesByUser } from "@/hooks/swr";

export default function ArchivedClassesPage() {
  const { user, loading: authLoading } = useAuth();

  const {
    data: classes = [],
    error: classesError,
    isLoading: classesLoading,
  } = useArchivedClassesByUser(user?.id ?? null);

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
      <div className="mb-4">
        <BackButton />
      </div>
      <InnerPageLayout title="Archived Classes">
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
            emptyMessage="No archived classes."
          />
        )}
      </InnerPageLayout>
    </PageLayout>
  );
}
