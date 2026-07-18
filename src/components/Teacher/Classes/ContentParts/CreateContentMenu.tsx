"use client";

import { useMemo } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CONTENT_TYPE_OPTIONS,
  CONTENT_TYPE_SEGMENTS,
  type ContentTypeId,
} from "@/lib/settings/registry";

/** "Create X" label per content type, in the menu's display order. */
const CREATE_LABELS: Record<ContentTypeId, string> = {
  formative_assignment: "Create Activity",
  learning_content: "Create Content",
  quiz: "Create Quiz",
  survey: "Create Survey",
};

export default function CreateContentMenu({
  classPublicId,
  selectedGroupId,
  allowedContentTypes,
}: {
  classPublicId: string;
  selectedGroupId: string | null;
  allowedContentTypes: string[];
}) {
  const router = useTrackedRouter();

  const qs = selectedGroupId ? `?tab=content&groupId=${selectedGroupId}` : "";

  const allowed = useMemo(() => new Set(allowedContentTypes), [
    allowedContentTypes,
  ]);
  const items = useMemo(
    () =>
      CONTENT_TYPE_OPTIONS.filter((opt) => allowed.has(opt.value)).map(
        (opt) => ({
          type: opt.value,
          label: CREATE_LABELS[opt.value],
          segment: CONTENT_TYPE_SEGMENTS[opt.value],
        }),
      ),
    [allowed],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!selectedGroupId || items.length === 0}>
          Create
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.type}
            onClick={() =>
              router.push(
                `/teacher/classes/${classPublicId}/${item.segment}/create${qs}`,
              )
            }
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
