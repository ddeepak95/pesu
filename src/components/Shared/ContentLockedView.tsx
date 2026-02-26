"use client";

import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";

export interface ContentLockedViewProps {
  lockReason: string;
  /** URL for the top "Go to class" button. */
  classHref: string;
  /** URL and label for the bottom action (e.g. "Go to previous item" or "Go to class"). */
  backHref: string;
  backLabel: string;
  /** When false, the bottom back button is hidden (e.g. when locked after completion). Default true. */
  showBackButton?: boolean;
}

/**
 * Reusable locked-content view for student assignment, learning-content, quiz, and survey pages.
 * Top button is always "Go to class"; bottom button is "Go to previous item" or "Go to class".
 */
export function ContentLockedView({
  lockReason,
  classHref,
  backHref,
  backLabel,
  showBackButton = true,
}: ContentLockedViewProps) {
  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <Button variant="outline" asChild>
            <Link href={classHref}>Go to class</Link>
          </Button>
        </div>
        <div className="text-center py-12">
          <div className="inline-block p-4 rounded-full bg-muted mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Content Locked</h2>
          <p className="text-muted-foreground mb-4">{lockReason}</p>
          {showBackButton && (
            <Button variant="outline" asChild>
              <Link href={backHref}>{backLabel}</Link>
            </Button>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
