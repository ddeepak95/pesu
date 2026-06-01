"use client";

import { useState } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { archiveClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";
import { showErrorToast } from "@/lib/toast";

interface ArchiveClassSectionProps {
  classData: Class;
  canArchive: boolean;
}

export default function ArchiveClassSection({
  classData,
  canArchive,
}: ArchiveClassSectionProps) {
  const { user } = useAuth();
  const router = useTrackedRouter();
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    if (!user || !canArchive) return;

    const confirmed = window.confirm(
      "Archive this class? It will be hidden from your class list and from " +
        "students. You can restore it anytime from Archived Classes."
    );

    if (!confirmed) return;

    setArchiving(true);
    try {
      await archiveClass(classData.id, user.id);
      router.push("/teacher/classes");
    } catch (err) {
      console.error("Error archiving class:", err);
      showErrorToast("Failed to archive class. Please try again.");
      setArchiving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive Class</CardTitle>
        <CardDescription>
          Hide this class without deleting it. You can restore it anytime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Archive this class</p>
            <p className="text-sm text-muted-foreground">
              The class is removed from your list and from students&apos; lists.
              Restore it anytime from the Archived Classes page.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleArchive}
            disabled={!canArchive || archiving}
          >
            {archiving ? "Archiving..." : "Archive Class"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
