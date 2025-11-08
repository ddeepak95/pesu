"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { updateClass } from "@/lib/queries/classes";
import { Class } from "@/types/class";

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
  const [className, setClassName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Update the className when classData changes
  useEffect(() => {
    if (classData) {
      setClassName(classData.name);
    }
  }, [classData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!className.trim()) {
      setError("Class name is required");
      return;
    }

    if (className.trim().length < 2) {
      setError("Class name must be at least 2 characters");
      return;
    }

    if (!user || !classData) {
      setError("Unable to update class");
      return;
    }

    setLoading(true);

    try {
      await updateClass(classData.id, className.trim(), user.id);
      onOpenChange(false);
      if (onClassUpdated) {
        onClassUpdated();
      }
    } catch (err) {
      console.error("Error updating class:", err);
      setError("Failed to update class. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Class</DialogTitle>
          <DialogDescription>
            Update the name of your class.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="className">Class Name</Label>
              <Input
                id="className"
                placeholder="e.g., Math 101"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

