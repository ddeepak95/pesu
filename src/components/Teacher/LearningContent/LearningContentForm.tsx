"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default function LearningContentForm({
  onSubmit,
  submitLabel = "Create",
  initialTitle = "",
  initialVideoUrl = "",
  initialBody = "",
  initialIsDraft = false,
}: {
  onSubmit: (data: {
    title: string;
    videoUrl: string;
    body: string;
    isDraft: boolean;
  }) => Promise<void>;
  submitLabel?: string;
  initialTitle?: string;
  initialVideoUrl?: string;
  initialBody?: string;
  initialIsDraft?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [body, setBody] = useState(initialBody);
  const [isDraft, setIsDraft] = useState(initialIsDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!videoUrl.trim() && !body.trim()) {
      setError("Add at least a video URL or some text content");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        videoUrl: videoUrl.trim(),
        body: body.trim(),
        isDraft,
      });
    } catch (err) {
      console.error("Error saving learning content:", err);
      setError("Failed to save learning content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="e.g., Newton's Laws (Intro)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="videoUrl">Video URL (optional)</Label>
        <Input
          id="videoUrl"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          disabled={loading}
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Text content (optional)</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={loading}
          placeholder="Write instructions/notes for students…"
          rows={10}
        />
      </div>

      <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/30">
        <Checkbox
          id="isDraft"
          checked={isDraft}
          onCheckedChange={(checked) => setIsDraft(checked === true)}
          disabled={loading}
        />
        <div className="space-y-1">
          <Label
            htmlFor="isDraft"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Save as draft
          </Label>
          <p className="text-sm text-muted-foreground">
            Draft items are visible to teachers but not available to students
            yet.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

