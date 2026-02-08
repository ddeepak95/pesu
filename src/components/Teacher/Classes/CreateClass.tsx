"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClass } from "@/lib/queries/classes";
import ClassForm from "./ClassForm";

interface CreateClassProps {
  onClassCreated?: () => void;
  isApproved?: boolean;
}

export default function CreateClass({ onClassCreated, isApproved = true }: CreateClassProps) {
  const [open, setOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
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

  if (!isApproved) {
    return (
      <Dialog open={lockedOpen} onOpenChange={setLockedOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Lock className="mr-2 h-4 w-4" />
            Create Class
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permission Required</DialogTitle>
            <DialogDescription>
              Reach out to{" "}
              <a
                href="mailto:dv292@cornell.edu"
                className="underline text-primary"
              >
                dv292@cornell.edu
              </a>{" "}
              for permission to create your class.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

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
