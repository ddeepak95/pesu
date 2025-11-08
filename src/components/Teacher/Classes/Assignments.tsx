"use client";

import { Class } from "@/types/class";

interface AssignmentsProps {
  classData: Class;
}

export default function Assignments({ classData }: AssignmentsProps) {
  return (
    <div className="py-6">
      <div className="text-center py-12 text-muted-foreground">
        <p>Assignments for {classData.name} will be displayed here</p>
        <p className="text-sm mt-2">Feature coming soon!</p>
      </div>
    </div>
  );
}

