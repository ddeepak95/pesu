"use client";

import type { TabWarningQuota } from "@/hooks/useTabLeaveTracking";

interface TabSwitchWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set (block_after_threshold mode), show how many tab leaves are allowed vs used */
  quota?: TabWarningQuota | null;
}

export function TabSwitchWarningDialog({
  open,
  onOpenChange,
  quota,
}: TabSwitchWarningDialogProps) {
  if (!open) return null;

  const remaining =
    quota != null ? Math.max(0, quota.max - quota.used) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-w-md rounded-lg bg-background p-6 shadow-lg border space-y-4">
        <h2 className="text-lg font-semibold">Stay on this tab</h2>
        <p className="text-sm text-muted-foreground">
          Please do not leave this tab until you finish the activity. Your
          activity is being monitored.
        </p>
        {quota != null ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <p>
              {remaining != null && remaining > 0 ? (
                <>
                  You will be locked out of the activity if you leave this tab{" "}
                  <span className="font-medium text-foreground">
                    {remaining}
                  </span>{" "}
                  more {remaining === 1 ? "time" : "times"}.
                </>
              ) : (
                <>
                  You will be locked out of the activity if you leave this tab
                  again.
                </>
              )}
            </p>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-1.5 text-sm rounded-md border bg-background hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
