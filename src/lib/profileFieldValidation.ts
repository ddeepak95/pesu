/**
 * Validation helpers for profile field types.
 */

/** Valid number: optional +/-; digits; optional decimal part. */
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;

/** Valid phone: 10+ digits, optional spaces/dashes/parens/leading + */
const PHONE_REGEX = /^[+]?[\d\s\-().]{10,}$/;

export function isValidNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return NUMBER_REGEX.test(trimmed) && !Number.isNaN(Number(trimmed));
}

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly.length >= 10 && PHONE_REGEX.test(trimmed);
}

export type ProfileFieldType = "text" | "dropdown" | "number" | "phone";

export function validateFieldValue(
  fieldType: ProfileFieldType,
  value: string,
  isMandatory: boolean
): { valid: boolean; message?: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return isMandatory
      ? { valid: false, message: "This field is required" }
      : { valid: true };
  }

  switch (fieldType) {
    case "number":
      return isValidNumber(value)
        ? { valid: true }
        : { valid: false, message: "Please enter a valid number" };
    case "phone":
      return isValidPhone(value)
        ? { valid: true }
        : { valid: false, message: "Please enter a valid phone number" };
    default:
      return { valid: true };
  }
}
