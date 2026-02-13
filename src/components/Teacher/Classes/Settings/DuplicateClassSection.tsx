"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { duplicateClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";

interface DuplicateClassSectionProps {
  classData: Class;
  isOwner: boolean;
  onDuplicated?: () => void;
}

export default function DuplicateClassSection({
  classData,
  isOwner,
  onDuplicated,
}: DuplicateClassSectionProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDuplicate = async () => {
    if (!user || !isOwner) return;

    const confirmed = window.confirm(
      "Create a copy of this class with all content and settings? The new class will have no students or co-teachers."
    );

    if (!confirmed) return;

    setError(null);
    setDuplicating(true);
    try {
      const newClass = await duplicateClass(classData.id, user.id);
      onDuplicated?.();
      router.push(`/teacher/classes/${newClass.class_id}`);
    } catch (err) {
      console.error("Error duplicating class:", err);
      setError(err instanceof Error ? err.message : "Failed to duplicate class. Please try again.");
      setDuplicating(false);
    }
  };

  if (!isOwner) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duplicate class</CardTitle>
        <CardDescription>
          Create a full copy of this class including all content, settings, and
          profile fields. The new class will have no students or co-teachers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleDuplicate}
            disabled={duplicating}
          >
            {duplicating ? "Duplicating..." : "Duplicate class"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
