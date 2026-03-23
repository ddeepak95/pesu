"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface AnalyticsPanelShellProps {
  title: string;
  headerAction?: React.ReactNode;
  headerBottom?: React.ReactNode;
  children: React.ReactNode;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

export default function AnalyticsPanelShell({
  title,
  headerAction,
  headerBottom,
  children,
  panelRef,
}: AnalyticsPanelShellProps) {
  return (
    <Card ref={panelRef}>
      <CardHeader className="space-y-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-medium">{title}</h3>
          {headerAction}
        </div>
        {headerBottom}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
