"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import Content from "@/components/Student/Classes/Content";
import MandatoryInfoDialog from "@/components/Student/Classes/MandatoryInfoDialog";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";
import { MandatoryField } from "@/types/mandatoryFields";
import {
  getMandatoryFieldsForClass,
  getStudentClassInfo,
} from "@/lib/queries/mandatoryFields";

export default function ClassDetailPage() {
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mandatory info state
  const [mandatoryFields, setMandatoryFields] = useState<MandatoryField[]>([]);
  const [existingResponses, setExistingResponses] = useState<
    Record<string, string>
  >({});
  const [showMandatoryDialog, setShowMandatoryDialog] = useState(false);
  const [mandatoryInfoChecked, setMandatoryInfoChecked] = useState(false);

  const fetchClass = useCallback(async () => {
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
  }, [classId]);

  useEffect(() => {
    if (classId) {
      fetchClass();
    }
  }, [classId, fetchClass]);

  // Check mandatory info after class data is loaded
  useEffect(() => {
    const checkMandatoryInfo = async () => {
      if (!classData || !user) return;

      try {
        // Fetch mandatory fields for this class
        const fields = await getMandatoryFieldsForClass(classData.id);
        setMandatoryFields(fields);

        // If no mandatory fields, no need for dialog
        if (fields.length === 0) {
          setMandatoryInfoChecked(true);
          return;
        }

        // Fetch student's existing responses
        const studentInfo = await getStudentClassInfo(classData.id, user.id);
        const responses = studentInfo?.field_responses || {};
        setExistingResponses(responses);

        // Check if all fields have responses
        const allFieldsFilled = fields.every((field) => {
          const response = responses[field.id];
          return response && response.trim() !== "";
        });

        if (!allFieldsFilled) {
          setShowMandatoryDialog(true);
        }

        setMandatoryInfoChecked(true);
      } catch (err) {
        console.error("Error checking mandatory info:", err);
        // If check fails, allow access (don't block on error)
        setMandatoryInfoChecked(true);
      }
    };

    checkMandatoryInfo();
  }, [classData, user]);

  const handleMandatoryInfoComplete = () => {
    setShowMandatoryDialog(false);
  };

  // Show loading while checking auth (middleware handles redirect if not authenticated)
  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading class details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !classData) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Class not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Mandatory info dialog - shows if student hasn't completed required fields */}
      {mandatoryFields.length > 0 && (
        <MandatoryInfoDialog
          classDbId={classData.id}
          className={classData.name}
          studentId={user.id}
          fields={mandatoryFields}
          existingResponses={existingResponses}
          open={showMandatoryDialog}
          onComplete={handleMandatoryInfoComplete}
        />
      )}

      <div>
        <div>
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
