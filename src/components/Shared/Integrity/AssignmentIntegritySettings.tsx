"use client";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TabSwitchPolicy } from "@/lib/integrity/constants";

export interface AssignmentIntegritySettingsValues {
  allowCopyPaste: boolean;
  tabSwitchPolicy: TabSwitchPolicy;
  tabSwitchMaxLeaves: number;
}

interface AssignmentIntegritySettingsProps {
  values: AssignmentIntegritySettingsValues;
  onChange: (next: AssignmentIntegritySettingsValues) => void;
  disabled?: boolean;
}

export function AssignmentIntegritySettings({
  values,
  onChange,
  disabled = false,
}: AssignmentIntegritySettingsProps) {
  const setPolicy = (tabSwitchPolicy: TabSwitchPolicy) => {
    onChange({
      ...values,
      tabSwitchPolicy,
      tabSwitchMaxLeaves:
        tabSwitchPolicy === "block_after_threshold"
          ? Math.max(1, values.tabSwitchMaxLeaves || 3)
          : values.tabSwitchMaxLeaves,
    });
  };

  return (
    <SettingsCard className="space-y-4">
      <Label className="text-sm font-medium">Assessment integrity</Label>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="p-3 border rounded-md bg-muted/30">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="allowCopyPaste"
              checked={values.allowCopyPaste}
              onCheckedChange={(checked) =>
                onChange({ ...values, allowCopyPaste: checked === true })
              }
              disabled={disabled}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="allowCopyPaste"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Allow copy and paste
              </Label>
              <InfoTooltip text="When off, students cannot paste into text chat or static text answers (clipboard shortcuts are blocked)." />
            </div>
          </div>
        </div>

        <div className="space-y-2 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="tabSwitchPolicy">Tab switching</Label>
            <InfoTooltip text="Tab leaves are always logged. Choose whether to show a reminder or lock the assessment after too many leaves." />
          </div>
          <Select
            value={values.tabSwitchPolicy}
            onValueChange={(v) => setPolicy(v as TabSwitchPolicy)}
            disabled={disabled}
          >
            <SelectTrigger id="tabSwitchPolicy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">Allow (log only, no warning)</SelectItem>
              <SelectItem value="warn">Warn when returning to the tab</SelectItem>
              <SelectItem value="block_after_threshold">
                Block after N tab leaves
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {values.tabSwitchPolicy === "block_after_threshold" && (
          <div className="space-y-2 p-3 border rounded-md bg-muted/30">
            <Label htmlFor="tabSwitchMaxLeaves">Maximum tab leaves allowed</Label>
            <Input
              id="tabSwitchMaxLeaves"
              type="number"
              min={1}
              value={values.tabSwitchMaxLeaves}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n) && n >= 1) {
                  onChange({ ...values, tabSwitchMaxLeaves: n });
                }
              }}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
