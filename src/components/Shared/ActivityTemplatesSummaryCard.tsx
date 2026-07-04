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

export interface ActivityTemplateSummaryItem {
  id: string;
  name: string;
  /** Short pill text, e.g. an owner-scope label or a default-listed status. */
  badge: string;
}

interface ActivityTemplatesSummaryCardProps {
  title: string;
  description: string;
  items: ActivityTemplateSummaryItem[];
  loading: boolean;
  emptyMessage: string;
  manageHref: string;
  manageLabel?: string;
}

/**
 * Read-only summary card + "Manage" link-out, shared by the class settings
 * "Activity Types" section and the institution settings "Activity Templates"
 * section. Each caller supplies its own data (via its own hook) and item
 * list; the elaborate create/edit/curate flow lives on the page `manageHref`
 * points to, not here.
 */
export default function ActivityTemplatesSummaryCard({
  title,
  description,
  items,
  loading,
  emptyMessage,
  manageHref,
  manageLabel = "Manage Activity Templates",
}: ActivityTemplatesSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="truncate text-sm font-medium">
                  {item.name}
                </span>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {item.badge}
                </span>
              </div>
            ))}
          </div>
        )}

        <Button asChild variant="outline">
          <Link href={manageHref}>
            {manageLabel}
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
