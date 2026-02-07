"use client";

import { useRef } from "react";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface MarkdownEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}

export default function MarkdownEditor({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = "Write content here…",
  rows = 6,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (prefix: string, suffix = "", placeholder = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const content = selected || placeholder;
    const nextValue =
      value.slice(0, start) + prefix + content + suffix + value.slice(end);
    const nextSelectionStart = start + prefix.length;
    const nextSelectionEnd = nextSelectionStart + content.length;

    onChange(nextValue);
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
    const selected = value.slice(start, end) || placeholder;
    const formatted = selected
      .split(/\r?\n/)
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const nextValue = value.slice(0, start) + formatted + value.slice(end);

    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + formatted.length);
    });
  };

  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview" disabled={!value.trim()}>
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
              disabled={disabled}
            >
              Bold
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => insertMarkdown("*", "*", "italic text")}
              disabled={disabled}
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
              disabled={disabled}
            >
              Link
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyLinePrefix("- ", "List item")}
              disabled={disabled}
            >
              Bullet list
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyLinePrefix("1. ", "List item")}
              disabled={disabled}
            >
              Numbered list
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyLinePrefix("> ", "Quote")}
              disabled={disabled}
            >
              Quote
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => insertMarkdown("```\n", "\n```", "code block")}
              disabled={disabled}
            >
              Code block
            </Button>
          </div>
          <Textarea
            id={id}
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            rows={rows}
          />
          <p className="text-xs text-muted-foreground">
            Use Markdown for formatting. Preview shows how students will see
            it.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="preview">
        <div className="rounded-md border border-input bg-muted/30 p-4">
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to preview yet.
            </p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
