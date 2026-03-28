"use client";

import { useRef, useState } from "react";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  TextQuote,
  Code,
  PenLine,
  Eye,
} from "lucide-react";

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
  const [tab, setTab] = useState("write");

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

  const isPreview = tab === "preview";

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => insertMarkdown("**", "**", "bold text")}
            disabled={disabled || isPreview}
            title="Bold"
            aria-label="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => insertMarkdown("*", "*", "italic text")}
            disabled={disabled || isPreview}
            title="Italic"
            aria-label="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => insertMarkdown("[", "](https://)", "link text")}
            disabled={disabled || isPreview}
            title="Link"
            aria-label="Link"
          >
            <Link className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => applyLinePrefix("- ", "List item")}
            disabled={disabled || isPreview}
            title="Bullet list"
            aria-label="Bullet list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => applyLinePrefix("1. ", "List item")}
            disabled={disabled || isPreview}
            title="Numbered list"
            aria-label="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => applyLinePrefix("> ", "Quote")}
            disabled={disabled || isPreview}
            title="Quote"
            aria-label="Quote"
          >
            <TextQuote className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => insertMarkdown("```\n", "\n```", "code block")}
            disabled={disabled || isPreview}
            title="Code block"
            aria-label="Code block"
          >
            <Code className="h-4 w-4" />
          </Button>
        </div>

        <TabsList className="h-8">
          <TabsTrigger value="write" className="h-7 px-2" title="Write" aria-label="Write">
            <PenLine className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="h-7 px-2"
            disabled={!value.trim()}
            title="Preview"
            aria-label="Preview"
          >
            <Eye className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="write" className="mt-0">
        <Textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-0">
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
