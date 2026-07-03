"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Class } from "@/types/class";
import type { TemplateOwnerScope } from "@/lib/queries/activityTemplates";
import { useAvailableTemplatesForClass } from "@/hooks/swr";

interface ActivityTypesSectionProps {
  classData: Class;
  classShortId: string;
  userId: string;
}

const SCOPE_LABEL: Record<TemplateOwnerScope, string> = {
  system: "Platform",
  class: "Class",
  user: "Personal",
  institution: "Institution",
};

export default function ActivityTypesSection({
  classData,
  classShortId,
}: ActivityTypesSectionProps) {
  const availableQuery = useAvailableTemplatesForClass(classData.id);
  const available = availableQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Types</CardTitle>
        <CardDescription>
          The activity types teachers can pick when building an assignment in
          this class. Use Manage Activity Templates to turn system types on or
          off, create class-owned types, or add types from your library.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableQuery.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading activity types…
          </div>
        ) : available.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
            No activity types are available in this class yet.
          </p>
        ) : (
          <div className="space-y-2">
            {available.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="truncate text-sm font-medium">{t.name}</span>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {SCOPE_LABEL[t.owner_scope]}
                </span>
              </div>
            ))}
          </div>
        )}

        <Button asChild variant="outline">
          <Link
            href={`/teacher/classes/${classShortId}/settings/activity-templates`}
          >
            Manage Activity Templates
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
