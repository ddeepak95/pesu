"use client";

import type { MouseEvent } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Class } from "@/types/class";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface ClassCardProps {
  classData: Class;
}

export default function ClassCard({ classData }: ClassCardProps) {
  const router = useTrackedRouter();

  const href = `/teacher/classes/${classData.class_id}`;

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
        aria-label={`Open class ${classData.name}`}
      />
      <CardHeader className="relative z-10 space-y-0 pointer-events-none">
        <CardTitle className="text-xl">{classData.name}</CardTitle>
      </CardHeader>
    </Card>
  );
}
