"use client";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Class } from "@/types/class";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { emitActivityEvent } from "@/lib/activity/emitter";

interface ClassCardProps {
  classData: Class;
  userId?: string;
}

export default function ClassCard({ classData, userId }: ClassCardProps) {
  const router = useTrackedRouter();

  const handleCardClick = () => {
    void emitActivityEvent({
      eventType: "class_opened",
      componentType: "class",
      componentId: classData.class_id,
      userId,
      classId: classData.id,
      subComponentId: "class_card",
      interactionSource: "click",
    });
    router.push(`/student/classes/${classData.class_id}`);
  };

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={handleCardClick}
    >
      <CardHeader>
        <CardTitle className="text-xl">{classData.name}</CardTitle>
      </CardHeader>
    </Card>
  );
}
