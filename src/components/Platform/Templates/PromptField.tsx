"use client";

import { useRef } from "react";
import { Variable } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PROMPT_VARIABLES } from "@/lib/promptTemplates";

type VariableEntry = {
  placeholder: string;
  description: string;
  category: "static" | "runtime";
};

/** Reverse lookup: placeholder string (e.g. "{{title}}") → its registry entry. */
const VARIABLE_BY_PLACEHOLDER = new Map<string, VariableEntry>(
  Object.values(PROMPT_VARIABLES).map((v) => [v.placeholder, v]),
);

function resolveVariables(placeholders: string[]): VariableEntry[] {
  return placeholders.map((placeholder) => {
    const entry = VARIABLE_BY_PLACEHOLDER.get(placeholder);
    return {
      placeholder,
      description: entry?.description ?? placeholder,
      category: entry?.category ?? "static",
    };
  });
}

/**
 * The "Insert Variable" panel beside the prompt textarea — the same affordance
 * the teacher-facing PromptConfigEditor offers: clickable variable chips that
 * insert at the cursor (with descriptions on hover) plus the conditional-block
 * hint. Variables are grouped static vs. runtime, mirroring the real editor.
 */
function VariablePanel({
  variables,
  onInsert,
}: {
  variables: VariableEntry[];
  onInsert: (placeholder: string) => void;
}) {
  const groups: { label: string; variables: VariableEntry[] }[] = [
    {
      label: "Static (known at config time):",
      variables: variables.filter((v) => v.category === "static"),
    },
    {
      label: "Runtime (actual values at assessment time):",
      variables: variables.filter((v) => v.category === "runtime"),
    },
  ].filter((g) => g.variables.length > 0);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 md:w-64 md:shrink-0">
      <div className="flex items-center gap-2">
        <Variable className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Insert Variable</span>
      </div>
      {groups.map((group) => (
        <div key={group.label}>
          <span className="text-xs text-muted-foreground">{group.label}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {group.variables.map(({ placeholder, description }) => (
              <Tooltip key={placeholder}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 font-mono text-xs"
                    onClick={() => onInsert(placeholder)}
                    type="button"
                  >
                    {placeholder}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Conditional blocks:</span> Use{" "}
        <code className="rounded bg-muted px-1">
          {"{{#if variable}}...{{/if}}"}
        </code>{" "}
        to include content only when a variable has a value.
      </p>
    </div>
  );
}

export function PromptField({
  label,
  required,
  hint,
  value,
  onChange,
  rows = 6,
  vars,
  mono = true,
  placeholder,
}: {
  label?: string;
  /** Marks the field as required with a trailing asterisk next to the label. */
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  /** Placeholder strings (e.g. "{{title}}") offered in the Insert Variable panel. */
  vars?: string[];
  mono?: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + token);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = value.substring(0, start) + token + value.substring(end);
    onChange(next);
    setTimeout(() => {
      textarea.focus();
      const pos = start + token.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const variables = vars && vars.length > 0 ? resolveVariables(vars) : [];

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5">
          <Label>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
          {hint && <InfoTooltip text={hint} />}
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={`flex-1 ${mono ? "font-mono text-sm" : "text-sm"}`}
        />
        {variables.length > 0 && (
          <VariablePanel variables={variables} onInsert={insertVariable} />
        )}
      </div>
    </div>
  );
}
