import * as React from "react";
import { createBulkInputGuard } from "./wordLimitGuards";

interface UsePasteGuardOptions {
  /** When false, paste/copy/cut/drop/context-menu are blocked in the textarea. */
  allowCopyPaste?: boolean;
  /** Submission id for logging bulk-input violations (word-limit guard). */
  submissionId?: string;
  /** Called with the guarded next value on every change. */
  onValueChange: (value: string) => void;
  /** Called when Enter (without Shift) is pressed — the callback guards emptiness. */
  onSubmit: () => void;
  /** Ref to the textarea, so a rejected bulk insert can be reverted in the DOM. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Shared copy-paste / bulk-input protection + Enter-to-send handlers for the
 * assessment text inputs. Extracted from ChatInputArea so the chat, static-text,
 * and multimodal-text inputs all share one implementation instead of duplicating
 * the four handlers. Enter sends (via `onSubmit`), Shift+Enter inserts a newline.
 */
export function usePasteGuard({
  allowCopyPaste = false,
  submissionId,
  onValueChange,
  onSubmit,
  textareaRef,
}: UsePasteGuardOptions) {
  const { guard } = React.useMemo(
    () => createBulkInputGuard(submissionId),
    [submissionId],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        !allowCopyPaste &&
        (e.ctrlKey || e.metaKey) &&
        (e.key === "c" || e.key === "v" || e.key === "x")
      ) {
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [allowCopyPaste, onSubmit],
  );

  const onPaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!allowCopyPaste) e.preventDefault();
    },
    [allowCopyPaste],
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      if (!allowCopyPaste) e.preventDefault();
    },
    [allowCopyPaste],
  );

  const onContextMenu = React.useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (!allowCopyPaste) e.preventDefault();
    },
    [allowCopyPaste],
  );

  const onChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const { allowed, nextValue } = guard(e.target.value);
      onValueChange(nextValue);
      if (!allowed && textareaRef?.current) {
        textareaRef.current.value = nextValue;
        requestAnimationFrame(() => {
          if (textareaRef.current) textareaRef.current.value = nextValue;
        });
      }
    },
    [guard, onValueChange, textareaRef],
  );

  return { onKeyDown, onPaste, onDrop, onContextMenu, onChange };
}
