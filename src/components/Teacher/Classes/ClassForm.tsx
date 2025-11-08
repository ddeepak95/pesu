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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supportedLanguages } from "@/utils/supportedLanguages";

interface ClassFormProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; preferredLanguage: string }) => Promise<void>;
  initialName?: string;
  initialLanguage?: string;
  triggerButton?: React.ReactNode;
}

export default function ClassForm({
  mode,
  open,
  onOpenChange,
  onSubmit,
  initialName = "",
  initialLanguage = "en",
  triggerButton,
}: ClassFormProps) {
  const [className, setClassName] = useState(initialName);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form values when initial values change
  useEffect(() => {
    setClassName(initialName);
    setPreferredLanguage(initialLanguage);
  }, [initialName, initialLanguage]);

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

    setLoading(true);

    try {
      await onSubmit({
        name: className.trim(),
        preferredLanguage,
      });
      
      // Reset form only on create mode
      if (mode === "create") {
        setClassName("");
        setPreferredLanguage("en");
      }
      
      onOpenChange(false);
    } catch (err) {
      console.error(`Error ${mode === "edit" ? "updating" : "creating"} class:`, err);
      setError(`Failed to ${mode === "edit" ? "update" : "create"} class. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{mode === "edit" ? "Edit Class" : "Create New Class"}</DialogTitle>
        <DialogDescription>
          {mode === "edit"
            ? "Update the details of your class."
            : "Enter a name for your new class. Students will be able to join using a unique invite link."}
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
          <div className="space-y-2">
            <Label htmlFor="preferredLanguage">Preferred Language</Label>
            <Select
              value={preferredLanguage}
              onValueChange={setPreferredLanguage}
              disabled={loading}
            >
              <SelectTrigger id="preferredLanguage">
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {loading
              ? mode === "edit" ? "Updating..." : "Creating..."
              : mode === "edit" ? "Update Class" : "Create Class"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  if (mode === "create" && triggerButton) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          {triggerButton}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogContent}
    </Dialog>
  );
}

