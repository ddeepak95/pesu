"use client";

import { useState, type MouseEvent } from "react";
import { ArrowRightLeft, MoreVertical } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MoveClassDialog from "@/components/Platform/MoveClassDialog";
import type { Class } from "@/types/class";

interface InstitutionClassCardProps {
  classData: Class;
  /** Where the card links. `{detailHrefBase}/{classData.id}` becomes the href. */
  detailHrefBase: string;
  /**
   * Whether the viewer can move this class to another institution. Only
   * super admins should pass `true` (the RPC enforces it server-side).
   */
  canMove?: boolean;
  /** UUID of the institution that currently owns this class. */
  currentInstitutionId?: string;
  /** `[id, name]` entries for the move target dropdown. */
  institutions?: Array<[string, string]>;
  /** UUID of the seeded default institution, if known. */
  defaultInstitutionId?: string | null;
}

/**
 * Card surface used inside the Classes tab of `InstitutionDetailView`.
 * Mirrors `InstitutionCard` so the two grids feel consistent. Super admins
 * get a kebab menu to move the class into another institution.
 */
export default function InstitutionClassCard({
  classData,
  detailHrefBase,
  canMove = false,
  currentInstitutionId,
  institutions,
  defaultInstitutionId = null,
}: InstitutionClassCardProps) {
  const router = useTrackedRouter();
  const [moveOpen, setMoveOpen] = useState(false);
  const href = `${detailHrefBase}/${classData.id}`;

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

  const showMenu = canMove && currentInstitutionId && institutions;

  return (
    <Card className="relative cursor-pointer transition-shadow hover:shadow-lg">
      <a
        href={href}
        onClick={handleLinkClick}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open class ${classData.name}`}
      />
      <CardHeader className="relative z-10 space-y-1 pointer-events-none">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl">{classData.name}</CardTitle>

          {showMenu && (
            <div
              className="pointer-events-auto z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Class actions"
                    title="Class actions"
                    className="h-8 w-8"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoveOpen(true);
                    }}
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Move to another institution…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="relative z-10 pointer-events-none">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {classData.class_id}
          </code>
          <span aria-hidden>·</span>
          <span>status: {classData.status}</span>
          <span aria-hidden>·</span>
          <span>created {classData.created_at.slice(0, 10)}</span>
        </div>
      </CardContent>

      {showMenu && (
        <MoveClassDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          classDbId={classData.id}
          className={classData.name}
          currentInstitutionId={currentInstitutionId!}
          institutions={institutions!}
          defaultInstitutionId={defaultInstitutionId}
        />
      )}
    </Card>
  );
}
