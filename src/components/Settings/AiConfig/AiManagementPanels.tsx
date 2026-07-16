"use client";

import type { ReactNode } from "react";

import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";

interface AiManagementPanelsProps {
  configuration: ReactNode;
  usage: ReactNode;
  defaultSubTab?: "configuration" | "usage";
}

/**
 * Nested sub-tab shell for both InstitutionAiManagementTab and
 * ClassAiManagementTab (see dev-docs/ai-usage-metering-phase4-plan.md
 * decision 2/3) — Configuration is AiSettingsPageContent (provider
 * activation + model bindings) plus the platform-credits access/spend card;
 * Usage is new. Wallets & limits used to be a separate sub-tab but was
 * folded into Configuration since the credits toggle and the model-config
 * locks are the same "how is AI provisioned for this scope" concern.
 */
export default function AiManagementPanels({
  configuration,
  usage,
  defaultSubTab = "configuration",
}: AiManagementPanelsProps) {
  return (
    <Tabs defaultValue={defaultSubTab} className="w-full">
      <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
        <MutedPrimaryTabsTrigger value="configuration" className="px-4 py-2">
          Configuration
        </MutedPrimaryTabsTrigger>
        <MutedPrimaryTabsTrigger value="usage" className="px-4 py-2">
          Usage
        </MutedPrimaryTabsTrigger>
      </MutedPrimaryTabsList>
      <TabsContent value="configuration" className="mt-0">
        {configuration}
      </TabsContent>
      <TabsContent value="usage" className="mt-0">
        {usage}
      </TabsContent>
    </Tabs>
  );
}
