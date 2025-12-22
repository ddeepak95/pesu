"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import Content from "@/components/Student/Classes/Content";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Show loading while checking auth (middleware handles redirect if not authenticated)
  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

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
          <div className="mb-4">
            <BackButton href="/students/classes" />
          </div>
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
          </div>

          <Content classData={classData} />
        </div>
      </div>
    </PageLayout>
  );
}

