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
import { deleteClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";

interface DangerZoneSectionProps {
  classData: Class;
  isOwner: boolean;
}

export default function DangerZoneSection({
  classData,
  isOwner,
}: DangerZoneSectionProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!user || !isOwner) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this class? This action cannot be undone."
    );

    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteClass(classData.id, user.id);
      router.push("/teacher/classes");
    } catch (err) {
      console.error("Error deleting class:", err);
      alert("Failed to delete class. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions that permanently affect this class.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Delete this class</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete this class and all its content. This cannot be
              undone.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!isOwner || deleting}
          >
            {deleting ? "Deleting..." : "Delete Class"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
