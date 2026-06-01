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
import { archiveClass, restoreClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";
import { showErrorToast } from "@/lib/toast";

interface ArchiveClassSectionProps {
  classData: Class;
  /** Full class control — gates both archive and restore. */
  canArchive: boolean;
}

export default function ArchiveClassSection({
  classData,
  canArchive,
}: ArchiveClassSectionProps) {
  const { user } = useAuth();
  const router = useTrackedRouter();
  const [pending, setPending] = useState(false);

  const isArchived = classData.status === "archived";

  const handleArchive = async () => {
    if (!user || !canArchive) return;

    const confirmed = window.confirm(
      "Archive this class? It will be hidden from your class list and from " +
        "students. You can restore it anytime from this page or Archived Classes."
    );

    if (!confirmed) return;

    setPending(true);
    try {
      await archiveClass(classData.id, user.id);
      router.push("/teacher/classes");
    } catch (err) {
      console.error("Error archiving class:", err);
      showErrorToast("Failed to archive class. Please try again.");
      setPending(false);
    }
  };

  const handleRestore = async () => {
    if (!user || !canArchive) return;

    setPending(true);
    try {
      await restoreClass(classData.id, user.id);
      router.refresh();
    } catch (err) {
      console.error("Error restoring class:", err);
      showErrorToast("Failed to restore class. Please try again.");
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isArchived ? "Restore Class" : "Archive Class"}</CardTitle>
        <CardDescription>
          {isArchived
            ? "This class is archived. Restore it to return it to your and students' class lists."
            : "Hide this class without deleting it. You can restore it anytime."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isArchived ? "Restore this class" : "Archive this class"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isArchived
                ? "The class returns to your class list and to enrolled students' lists."
                : "The class is removed from your list and from students' lists. Restore it anytime from this page or the Archived Classes page."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={isArchived ? handleRestore : handleArchive}
            disabled={!canArchive || pending}
          >
            {isArchived
              ? pending
                ? "Restoring..."
                : "Restore Class"
              : pending
                ? "Archiving..."
                : "Archive Class"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
