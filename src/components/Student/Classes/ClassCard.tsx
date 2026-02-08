"use client";

import { useRouter } from "next/navigation";
import { Class } from "@/types/class";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface ClassCardProps {
  classData: Class;
}

export default function ClassCard({ classData }: ClassCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
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
