"use client";

import * as React from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function MutedPrimaryTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "!bg-background text-muted-foreground [&_[role=tab][data-state=inactive]]:!text-foreground/70",
        className,
      )}
      {...props}
    />
  );
}

export function MutedPrimaryTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        // ! overrides TabsTrigger's data-[state=active]:bg-background when tailwind-merge keeps both
        "data-[state=active]:!bg-tabs-active data-[state=active]:!text-tabs-active-foreground data-[state=active]:!shadow-md data-[state=active]:!ring-1 data-[state=active]:!ring-[var(--color-beige-400)]/40 data-[state=active]:!ring-offset-0 data-[state=active]:!ring-offset-transparent",
        className
      )}
      {...props}
    />
  );
}
