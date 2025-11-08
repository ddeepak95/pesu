"use client";

import { useAuth } from "@/contexts/AuthContext";
import { updateClass } from "@/lib/queries/classes";
import { Class } from "@/types/class";
import ClassForm from "./ClassForm";

interface EditClassProps {
  classData: Class | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClassUpdated?: () => void;
}

export default function EditClass({
  classData,
  open,
  onOpenChange,
  onClassUpdated,
}: EditClassProps) {
  const { user } = useAuth();

  const handleSubmit = async (data: { name: string; preferredLanguage: string }) => {
    if (!user || !classData) {
      throw new Error("Unable to update class");
    }

    await updateClass(classData.id, data.name, user.id, data.preferredLanguage);
    
    if (onClassUpdated) {
      onClassUpdated();
    }
  };

  return (
    <ClassForm
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      initialName={classData?.name || ""}
      initialLanguage={classData?.preferred_language || "en"}
    />
  );
}

