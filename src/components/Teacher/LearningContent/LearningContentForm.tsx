"use client";

import { useRef, useState } from "react";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (prefix: string, suffix = "", placeholder = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = body.slice(start, end);
    const content = selected || placeholder;
    const nextValue =
      body.slice(0, start) + prefix + content + suffix + body.slice(end);
    const nextSelectionStart = start + prefix.length;
    const nextSelectionEnd = nextSelectionStart + content.length;

    setBody(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  };

  const applyLinePrefix = (prefix: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = body.slice(start, end) || placeholder;
    const formatted = selected
      .split(/\r?\n/)
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const nextValue = body.slice(0, start) + formatted + body.slice(end);

    setBody(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + formatted.length);
    });
  };

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
        <div className="flex items-center justify-between">
          <Label htmlFor="body">Text content (optional)</Label>
          <span className="text-xs text-muted-foreground">
            Markdown supported
          </span>
        </div>
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview" disabled={!body.trim()}>
              Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMarkdown("**", "**", "bold text")}
                  disabled={loading}
                >
                  Bold
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMarkdown("*", "*", "italic text")}
                  disabled={loading}
                >
                  Italic
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    insertMarkdown("[", "](https://)", "link text")
                  }
                  disabled={loading}
                >
                  Link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyLinePrefix("- ", "List item")}
                  disabled={loading}
                >
                  Bullet list
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyLinePrefix("1. ", "List item")}
                  disabled={loading}
                >
                  Numbered list
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyLinePrefix("> ", "Quote")}
                  disabled={loading}
                >
                  Quote
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertMarkdown("```\n", "\n```", "code block")}
                  disabled={loading}
                >
                  Code block
                </Button>
              </div>
              <Textarea
                id="body"
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={loading}
                placeholder="Write instructions/notes for students…"
                rows={10}
              />
              <p className="text-xs text-muted-foreground">
                Use Markdown for formatting. Preview shows how students will see
                it.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="preview">
            <div className="rounded-md border border-input bg-muted/30 p-4">
              {body.trim() ? (
                <MarkdownContent content={body} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing to preview yet.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
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
