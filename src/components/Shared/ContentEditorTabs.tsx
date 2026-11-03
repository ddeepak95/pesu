"use client";
import type { ComponentProps } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function ContentEditorTabs({
  children,
  hideTabs = false,
  ...props
}: ComponentProps<typeof Tabs> & { hideTabs?: boolean }) {
  return (
    <Tabs defaultValue="content" className="w-full" {...props}>
      {!hideTabs && (
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-[var(--class-underline-tab-rule)] bg-transparent p-0">
          {(
            [
              ["content", "Content"],
              ["settings", "Settings"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {children}
    </Tabs>
  );
}
