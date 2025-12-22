"use client";

import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";

export default function StudentLearningContentPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;
  const learningContentId = params.learningContentId as string;

  return (
    <PageLayout>
      <div className="p-8">
        <div className="mb-4">
          <BackButton href={`/students/classes/${classId}`} />
        </div>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Learning Content</h1>
          <p className="text-muted-foreground">
            Learning content view for students - Coming soon!
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Content ID: {learningContentId}
          </p>
        </div>
      </div>
    </PageLayout>
  );
}

