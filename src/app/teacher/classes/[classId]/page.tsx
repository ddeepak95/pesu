"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import InnerPageLayout from "@/components/Layout/InnerPageLayout";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    if (classId) {
      fetchClass();
    }
  }, [classId]);

  return (
    <PageLayout>
      {loading ? (
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading class details...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      ) : classData ? (
        <InnerPageLayout title={classData.name}>
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-2">Class Information</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Class ID:</span>{" "}
                  <span className="font-mono">{classData.class_id}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  {new Date(classData.created_at).toLocaleDateString()}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className="capitalize">{classData.status}</span>
                </p>
              </div>
            </div>
            {/* Add more class-specific content here later */}
          </div>
        </InnerPageLayout>
      ) : null}
    </PageLayout>
  );
}

