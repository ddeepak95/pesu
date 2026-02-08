"use client";

import PageLayout from "@/components/PageLayout";
import InnerPageLayout from "@/components/Layout/InnerPageLayout";
import CreateClass from "@/components/Teacher/Classes/CreateClass";
import ClassCard from "@/components/Teacher/Classes/ClassCard";
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { useClassesByUser, useIsTeacherApproved } from "@/hooks/swr";

export default function ClassesPage() {
  const { user, loading: authLoading } = useAuth();

  const { data: classes = [], error: classesError, isLoading: classesLoading, mutate: mutateClasses } =
    useClassesByUser(user?.id ?? null);
  const { data: approved = false } = useIsTeacherApproved(user?.email ?? null);

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

  const emptyMessage =
    approved
      ? "No classes yet. Create your first class to get started!"
      : undefined;

  return (
    <PageLayout>
      <InnerPageLayout
        title="Classes"
        action={
          <CreateClass onClassCreated={() => mutateClasses()} isApproved={approved} />
        }
      >
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading classes...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive">{error}</p>
          </div>
        ) : classes.length === 0 && !approved ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              You don&apos;t have any classes yet.
            </p>
            <p className="text-muted-foreground mt-2">
              Reach out to{" "}
              <a
                href="mailto:dv292@cornell.edu"
                className="underline text-primary"
              >
                dv292@cornell.edu
              </a>{" "}
              for permission to create your class.
            </p>
          </div>
        ) : (
          <List
            items={classes}
            renderItem={(classItem) => (
              <ClassCard
                key={classItem.id}
                classData={classItem}
              />
            )}
            emptyMessage={emptyMessage}
          />
        )}
      </InnerPageLayout>
    </PageLayout>
  );
}
