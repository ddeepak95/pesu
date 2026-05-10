import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Matches `--pill-<kebab>-{bg,fg,border}` in globals.css */
export const pillPurposes = [
  "contentType",
  "assessmentMode",
  "language",
  "draft",
  "linkedMaterial",
  "lockAfterComplete",
  "teacherUnlockRequired",
  "scheduledUnlock",
  "submissionCompleted",
  "submissionInProgress",
  "submissionNotStarted",
  "pendingApproval",
  "surveyLikert",
  "surveyDropdown",
  "surveyOpenEnded",
  "dynamicQuestion",
  "dynamicRubric",
  "contentCompleted",
  "contentLocked",
  "assignmentActivityType",
  "assignmentMeta",
  "assignmentPublicAccess",
] as const;

export type PillPurpose = (typeof pillPurposes)[number];

const PURPOSE_CSS_PREFIX: Record<PillPurpose, string> = {
  contentType: "content-type",
  assessmentMode: "assessment-mode",
  language: "language",
  draft: "draft",
  linkedMaterial: "linked-material",
  lockAfterComplete: "lock-after-complete",
  teacherUnlockRequired: "teacher-unlock-required",
  scheduledUnlock: "scheduled-unlock",
  submissionCompleted: "submission-completed",
  submissionInProgress: "submission-in-progress",
  submissionNotStarted: "submission-not-started",
  pendingApproval: "pending-approval",
  surveyLikert: "survey-likert",
  surveyDropdown: "survey-dropdown",
  surveyOpenEnded: "survey-open-ended",
  dynamicQuestion: "dynamic-question",
  dynamicRubric: "dynamic-rubric",
  contentCompleted: "content-completed",
  contentLocked: "content-locked",
  assignmentActivityType: "assignment-activity-type",
  assignmentMeta: "assignment-meta",
  assignmentPublicAccess: "assignment-public-access",
};

export function pillPurposeStyle(purpose: PillPurpose): React.CSSProperties {
  const p = PURPOSE_CSS_PREFIX[purpose];
  return {
    backgroundColor: `var(--pill-${p}-bg)`,
    color: `var(--pill-${p}-fg)`,
    borderColor: `var(--pill-${p}-border)`,
  };
}

const pillVariants = cva(
  "inline-flex max-w-full shrink-0 items-center gap-1 border border-solid leading-none transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "px-2 py-0.5 text-xs font-normal [&_svg]:size-3",
        md: "px-2 py-1 text-xs font-medium [&_svg]:size-3",
        lg: "gap-1.5 px-3 py-1.5 text-sm font-medium [&_svg]:size-4",
      },
      shape: {
        pill: "rounded-full",
        soft: "rounded-md",
      },
    },
    defaultVariants: {
      size: "sm",
      shape: "pill",
    },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  purpose: PillPurpose;
}

const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, purpose, size, shape, style, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(pillVariants({ size, shape }), className)}
      style={{ ...pillPurposeStyle(purpose), ...style }}
      {...props}
    />
  ),
);
Pill.displayName = "Pill";

export { Pill, pillVariants };
