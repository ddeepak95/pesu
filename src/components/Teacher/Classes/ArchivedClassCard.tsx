"use client";

import { useState } from "react";
import { Class } from "@/types/class";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { restoreClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";
import { showErrorToast } from "@/lib/toast";

interface ArchivedClassCardProps {
  classData: Class;
  onRestored: () => void;
}

export default function ArchivedClassCard({
  classData,
  onRestored,
}: ArchivedClassCardProps) {
  const { user } = useAuth();
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    if (!user) return;

    setRestoring(true);
    try {
      await restoreClass(classData.id, user.id);
      onRestored();
    } catch (err) {
      console.error("Error restoring class:", err);
      showErrorToast("Failed to restore class. Please try again.");
      setRestoring(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">{classData.name}</CardTitle>
        <Button
          type="button"
          variant="outline"
          onClick={handleRestore}
          disabled={restoring}
        >
          {restoring ? "Restoring..." : "Restore"}
        </Button>
      </CardHeader>
    </Card>
  );
}
