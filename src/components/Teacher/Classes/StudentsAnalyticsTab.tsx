"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileField } from "@/types/profileFields";
import { StudentsAnalyticsBucket } from "./hooks/useClassStudentsData";
import { toPng } from "html-to-image";
import AnalyticsPanelShell from "./analytics/AnalyticsPanelShell";
import AnalyticsPanelLegend from "./analytics/AnalyticsPanelLegend";
import AnalyticsSortableRows from "./analytics/AnalyticsSortableRows";
import AnalyticsPanelActions from "./analytics/AnalyticsPanelActions";

interface StudentsAnalyticsTabProps {
  filterableFields: ProfileField[];
  groupBuckets: StudentsAnalyticsBucket[];
  buildProfileBuckets: (fieldId: string) => StudentsAnalyticsBucket[];
  progressLoading: boolean;
}

export default function StudentsAnalyticsTab({
  filterableFields,
  groupBuckets,
  buildProfileBuckets,
  progressLoading,
}: StudentsAnalyticsTabProps) {
  const groupPanelRef = useRef<HTMLDivElement | null>(null);
  const profilePanelRef = useRef<HTMLDivElement | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [groupSort, setGroupSort] = useState<{
    key: "label" | "totalStudents";
    direction: "asc" | "desc";
  }>({
    key: "label",
    direction: "asc",
  });
  const [profileSort, setProfileSort] = useState<{
    key: "label" | "totalStudents";
    direction: "asc" | "desc";
  }>({
    key: "label",
    direction: "asc",
  });

  const resolvedFieldId =
    selectedFieldId || filterableFields[0]?.id || "";

  const rawProfileBuckets = useMemo(() => {
    if (!resolvedFieldId) return [];
    return buildProfileBuckets(resolvedFieldId);
  }, [buildProfileBuckets, resolvedFieldId]);

  const sortBuckets = (
    inputRows: StudentsAnalyticsBucket[],
    sort: { key: "label" | "totalStudents"; direction: "asc" | "desc" },
  ) => {
    const rows = [...inputRows];
    rows.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      if (sort.key === "label") {
        return a.label.localeCompare(b.label) * dir;
      }
      return (a.totalStudents - b.totalStudents) * dir;
    });
    return rows;
  };

  const sortedGroupBuckets = useMemo(
    () => sortBuckets(groupBuckets, groupSort),
    [groupBuckets, groupSort],
  );
  const sortedProfileBuckets = useMemo(
    () => sortBuckets(rawProfileBuckets, profileSort),
    [rawProfileBuckets, profileSort],
  );

  const selectedField = useMemo(
    () => filterableFields.find((field) => field.id === resolvedFieldId) ?? null,
    [filterableFields, resolvedFieldId],
  );

  const handleSortChange = (
    current: { key: "label" | "totalStudents"; direction: "asc" | "desc" },
    key: "label" | "totalStudents",
    setter: (next: { key: "label" | "totalStudents"; direction: "asc" | "desc" }) => void,
  ) => {
    if (current.key === key) {
      setter({
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      });
      return;
    }
    setter({ key, direction: "asc" });
  };

  const downloadPanelAsPng = async (
    panelRef: RefObject<HTMLDivElement | null>,
    filename: string,
  ) => {
    if (!panelRef.current) return;
    try {
      const dataUrl = await toPng(panelRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Failed to export analytics panel:", error);
    }
  };

  if (progressLoading) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPanelShell
        title="Group"
        panelRef={groupPanelRef}
        headerAction={
          <AnalyticsPanelActions
            onDownloadPng={() =>
              downloadPanelAsPng(groupPanelRef, "analytics-group-panel.png")
            }
          />
        }
      >
        <AnalyticsPanelLegend />
        <AnalyticsSortableRows
          rows={sortedGroupBuckets}
          emptyMessage="No students are enrolled yet."
          sortKey={groupSort.key}
          sortDirection={groupSort.direction}
          onSort={(key) => handleSortChange(groupSort, key, setGroupSort)}
        />
      </AnalyticsPanelShell>

      <AnalyticsPanelShell
        title="Profile"
        panelRef={profilePanelRef}
        headerAction={
          <div className="flex w-full max-w-[420px] items-center gap-2">
            <Select
              value={resolvedFieldId}
              onValueChange={setSelectedFieldId}
              disabled={filterableFields.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select profile field" />
              </SelectTrigger>
              <SelectContent>
                {filterableFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.field_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AnalyticsPanelActions
              onDownloadPng={() =>
                downloadPanelAsPng(profilePanelRef, "analytics-profile-panel.png")
              }
            />
          </div>
        }
        headerBottom={
          selectedField ? (
            <p className="text-xs text-muted-foreground">
              Viewing distribution by {selectedField.field_name}
            </p>
          ) : undefined
        }
      >
        <AnalyticsPanelLegend />
        {filterableFields.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            <p>
              No category fields configured. Mark dropdown profile fields as
              filter fields in Class settings.
            </p>
          </div>
        ) : (
          <AnalyticsSortableRows
            rows={sortedProfileBuckets}
            emptyMessage="No students found for this profile field."
            sortKey={profileSort.key}
            sortDirection={profileSort.direction}
            onSort={(key) => handleSortChange(profileSort, key, setProfileSort)}
          />
        )}
      </AnalyticsPanelShell>
    </div>
  );
}
