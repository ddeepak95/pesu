"use client";

import { Class } from "@/types/class";

interface StudentsProps {
  classData: Class;
}

export default function Students({ classData }: StudentsProps) {
  return (
    <div className="py-6">
      <div className="text-center py-12 text-muted-foreground">
        <p>Students enrolled in {classData.name} will be displayed here</p>
        <p className="text-sm mt-2">Feature coming soon!</p>
      </div>
    </div>
  );
}

