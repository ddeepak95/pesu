"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { createClass } from "@/lib/queries/classes";
import ClassForm from "./ClassForm";

interface CreateClassProps {
  onClassCreated?: () => void;
}

export default function CreateClass({ onClassCreated }: CreateClassProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (data: { name: string; preferredLanguage: string }) => {
    if (!user) {
      throw new Error("You must be logged in to create a class");
    }

    await createClass(data.name, user.id, data.preferredLanguage);
    
    if (onClassCreated) {
      onClassCreated();
    }
  };

  return (
    <ClassForm
      mode="create"
      open={open}
      onOpenChange={setOpen}
      onSubmit={handleSubmit}
      triggerButton={<Button>Create Class</Button>}
    />
  );
}
