/**
 * Helpers for PostgREST / Supabase client errors, which often stringify as
 * `{}` in console because key fields are non-enumerable or the object is odd-shaped.
 */

export type PostgrestErrorFields = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function extractPostgrestErrorFields(err: unknown): PostgrestErrorFields {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message =
      asNonEmptyString(o.message) ??
      asNonEmptyString(o.error_description) ??
      "Request failed.";
    return {
      message,
      code: asNonEmptyString(o.code),
      details: asNonEmptyString(o.details),
      hint: asNonEmptyString(o.hint),
    };
  }
  if (err instanceof Error) {
    return { message: err.message || "Request failed." };
  }
  return { message: String(err) };
}

export function logPostgrestError(context: string, err: unknown): void {
  const fields = extractPostgrestErrorFields(err);
  console.error(context, { ...fields, err });
}

/** Short, single-line copy for toasts; includes code/details when concise. */
export function userFacingPostgrestMessage(
  err: unknown,
  fallback: string
): string {
  const { message, code, details, hint } = extractPostgrestErrorFields(err);

  if (
    message.includes("Not permitted to manage teacher invites") ||
    message.includes("Not permitted to revoke teacher invites")
  ) {
    return "You don't have permission to manage teacher invites for this class.";
  }

  if (
    message.includes("Only class owner can create teacher invites") ||
    message.includes("Only class owner can revoke teacher invites")
  ) {
    return "Teacher invite actions are restricted by the database (apply the class-teacher RBAC migration or use an account with access).";
  }

  const parts: string[] = [message];
  if (code) parts.push(`[${code}]`);
  if (details && details.length < 120) parts.push(details);
  else if (hint && hint.length < 120) parts.push(hint);

  const joined = parts.join(" ").trim();
  if (!joined || joined === "Request failed.") return fallback;
  return joined.length > 280 ? `${joined.slice(0, 277)}…` : joined;
}
