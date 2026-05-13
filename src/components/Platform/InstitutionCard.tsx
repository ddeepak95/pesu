"use client";

import type { MouseEvent } from "react";
import { Building2 } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Institution } from "@/lib/queries/institutions";

interface InstitutionCardProps {
  institution: Institution;
  classCount: number;
  /** Where clicking the card sends the user. */
  detailHrefBase: string;
}

/**
 * Card surface used by both `/platform` (super-admin grid) and any future
 * admin landing pages that show an institution list.
 */
export default function InstitutionCard({
  institution,
  classCount,
  detailHrefBase,
}: InstitutionCardProps) {
  const router = useTrackedRouter();
  const href = `${detailHrefBase}/${institution.id}`;

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const isPlainLeftClick =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;
    if (!isPlainLeftClick) return;
    event.preventDefault();
    router.push(href);
  };

  return (
    <Card className="relative cursor-pointer transition-shadow hover:shadow-lg">
      <a
        href={href}
        onClick={handleLinkClick}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open ${institution.name}`}
      />
      <CardHeader className="relative z-10 space-y-1 pointer-events-none">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">
            {institution.is_default ? "default institution" : "institution"}
          </span>
        </div>
        <CardTitle className="text-xl">{institution.name}</CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 pointer-events-none">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            {classCount} {classCount === 1 ? "class" : "classes"}
          </span>
          <span aria-hidden>·</span>
          <span>status: {institution.status}</span>
          {institution.slug && (
            <>
              <span aria-hidden>·</span>
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {institution.slug}
              </code>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
