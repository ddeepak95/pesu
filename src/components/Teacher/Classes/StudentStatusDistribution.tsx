"use client";

interface StudentStatusDistributionProps {
  completed: number;
  inProgress: number;
  notStarted: number;
  total: number;
}

const widthPercent = (value: number, total: number) => {
  if (total <= 0) return 0;
  return (value / total) * 100;
};

export default function StudentStatusDistribution({
  completed,
  inProgress,
  notStarted,
  total,
}: StudentStatusDistributionProps) {
  return (
    <div className="min-w-[230px]">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="flex h-full w-full">
          <div
            className="bg-green-500"
            style={{ width: `${widthPercent(completed, total)}%` }}
            title={`Completed: ${completed}`}
          />
          <div
            className="bg-primary"
            style={{ width: `${widthPercent(inProgress, total)}%` }}
            title={`In progress: ${inProgress}`}
          />
          <div
            className="bg-muted-foreground/40"
            style={{ width: `${widthPercent(notStarted, total)}%` }}
            title={`Not started: ${notStarted}`}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>C {completed}</span>
        <span>IP {inProgress}</span>
        <span>NS {notStarted}</span>
      </div>
    </div>
  );
}
