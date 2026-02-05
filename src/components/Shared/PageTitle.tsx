import React from "react";
import { cn } from "@/lib/utils";

interface PageTitleProps {
  title: string;
  badge?: React.ReactNode;
  className?: string;
}

export default function PageTitle({ title, badge, className }: PageTitleProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {badge}
      <h1 className="text-3xl font-bold">{title}</h1>
    </div>
  );
}
