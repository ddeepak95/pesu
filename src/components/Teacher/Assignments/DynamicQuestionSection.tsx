"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DynamicQuestionFocus } from "@/types/assignment";
import { Plus, Trash2 } from "lucide-react";

interface DynamicQuestionSectionProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  focuses: DynamicQuestionFocus[];
  setFocuses: (focuses: DynamicQuestionFocus[]) => void;
  loading: boolean;
}

export function DynamicQuestionSection({
  enabled,
  setEnabled,
  focuses,
  setFocuses,
  loading,
}: DynamicQuestionSectionProps) {
  const handleFocusChange = (index: number, value: string) => {
    const updated = [...focuses];
    updated[index] = { ...updated[index], focus: value };
    setFocuses(updated);
  };

  const handlePointsChange = (index: number, value: number) => {
    const updated = [...focuses];
    updated[index] = { ...updated[index], points: value };
    setFocuses(updated);
  };

  const handleAdd = () => {
    setFocuses([...focuses, { focus: "", points: 0 }]);
  };

  const handleRemove = (index: number) => {
    if (focuses.length <= 1) return;
    setFocuses(focuses.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="dynamicQuestionsEnabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked === true)}
          disabled={loading}
        />
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="dynamicQuestionsEnabled"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Generate Questions and Rubric Dynamically
          </Label>
          <InfoTooltip text="Questions, rubrics, and expected answers will be generated dynamically for each student based on their uploaded files and the focus areas you define below." />
        </div>
      </div>

      {enabled && (
        <div className="space-y-4 pl-6">
          <p className="text-xs text-muted-foreground">
            Define focus areas and point allocations. One question will be
            generated per focus area based on the student&apos;s uploaded files.
          </p>

          <div className="space-y-3">
            {focuses.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  {index === 0 && (
                    <Label className="text-xs text-muted-foreground">
                      Question Focus
                    </Label>
                  )}
                  <Input
                    value={item.focus}
                    onChange={(e) => handleFocusChange(index, e.target.value)}
                    disabled={loading}
                    placeholder="e.g., Understanding of key concepts..."
                  />
                </div>
                <div className="w-24 space-y-1">
                  {index === 0 && (
                    <Label className="text-xs text-muted-foreground">
                      Points
                    </Label>
                  )}
                  <Input
                    type="number"
                    min={1}
                    value={item.points || ""}
                    onChange={(e) =>
                      handlePointsChange(index, parseInt(e.target.value) || 0)
                    }
                    disabled={loading}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  {index === 0 && (
                    <Label className="text-xs text-muted-foreground invisible">
                      Del
                    </Label>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(index)}
                    disabled={loading || focuses.length <= 1}
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={loading}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Focus Area
          </Button>

          <p className="text-xs text-muted-foreground">
            Total points:{" "}
            <span className="font-medium">
              {focuses.reduce((sum, f) => sum + (f.points || 0), 0)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
