/**
 * Client-side structural validation for template prompt fields — mirrors the
 * Handlebars-style syntax `interpolatePrompt` (src/lib/promptInterpolation.ts)
 * actually understands at runtime: `{{#if variable}}...{{/if}}` conditional
 * blocks and `{{variable}}` placeholders.
 *
 * Catches authoring mistakes that would otherwise fail silently at runtime —
 * an unclosed `{{#if}}` swallows the rest of the prompt, an unknown variable
 * name never resolves and is left literally in the text sent to the model.
 */

export interface ValidationIssue {
  fieldId: string;
  fieldLabel: string;
  message: string;
}

export interface ValidatableField {
  id: string;
  label: string;
  value: string;
  /** Marks the field as required — an empty value is reported as an issue. */
  required?: boolean;
  /**
   * Bare variable names (no braces, e.g. "title", "support_language") recognized in
   * this field. Omit to skip the unknown-variable check (e.g. fields with no
   * documented variable set).
   */
  knownVars?: string[];
}

/** Strips the surrounding `{{` `}}` from a placeholder string, e.g. "{{title}}" -> "title". */
export function bareVarName(placeholder: string): string {
  return placeholder.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
}

const TOKEN_RE = /\{\{\s*(#if\s+[\w.:]+|#if\s*|\/if|[\w.:]*)\s*\}\}/g;

export function validateField(field: ValidatableField): ValidationIssue[] {
  const { id, label, value } = field;
  const issues: ValidationIssue[] = [];

  if (!value || !value.trim()) {
    if (field.required) {
      issues.push({
        fieldId: id,
        fieldLabel: label,
        message: "This field is required and cannot be empty.",
      });
    }
    return issues;
  }

  const openBraces = (value.match(/\{\{/g) ?? []).length;
  const closeBraces = (value.match(/\}\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    issues.push({
      fieldId: id,
      fieldLabel: label,
      message: `Unbalanced "{{" / "}}" — found ${openBraces} opening and ${closeBraces} closing.`,
    });
  }

  const stack: string[] = [];
  const seenUnknown = new Set<string>();
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(value))) {
    const token = match[1].trim();
    if (token.startsWith("#if")) {
      const varName = token.slice(3).trim();
      if (!varName) {
        issues.push({
          fieldId: id,
          fieldLabel: label,
          message: 'A "{{#if}}" block is missing its variable name.',
        });
      } else if (
        field.knownVars &&
        !field.knownVars.includes(varName) &&
        !seenUnknown.has(varName)
      ) {
        seenUnknown.add(varName);
        issues.push({
          fieldId: id,
          fieldLabel: label,
          message: `"{{#if ${varName}}}" references a variable not available in this field.`,
        });
      }
      stack.push(varName);
    } else if (token === "/if") {
      if (stack.length === 0) {
        issues.push({
          fieldId: id,
          fieldLabel: label,
          message: 'Found a "{{/if}}" with no matching "{{#if}}".',
        });
      } else {
        stack.pop();
      }
    } else if (token && field.knownVars && !field.knownVars.includes(token)) {
      if (!seenUnknown.has(token)) {
        seenUnknown.add(token);
        issues.push({
          fieldId: id,
          fieldLabel: label,
          message: `"{{${token}}}" is not a recognized variable for this field.`,
        });
      }
    }
  }
  if (stack.length > 0) {
    issues.push({
      fieldId: id,
      fieldLabel: label,
      message: `${stack.length} "{{#if}}" block(s) are never closed with "{{/if}}".`,
    });
  }

  return issues;
}

export function validateFields(fields: ValidatableField[]): ValidationIssue[] {
  return fields.flatMap(validateField);
}
