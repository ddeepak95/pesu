import type { ClassTeacherRole } from "@/types/class";

export function canConfigureClassSettings(role: ClassTeacherRole | null): boolean {
  return (
    role === "owner" ||
    role === "co-owner" ||
    role === "admin"
  );
}

export function hasFullClassControl(role: ClassTeacherRole | null): boolean {
  return role === "owner" || role === "co-owner";
}

export function canManageClassRoster(role: ClassTeacherRole | null): boolean {
  return canConfigureClassSettings(role);
}

export function canPromoteCoOwner(role: ClassTeacherRole | null): boolean {
  return hasFullClassControl(role);
}
