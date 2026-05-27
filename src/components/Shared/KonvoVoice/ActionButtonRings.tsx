"use client";

const RING_DELAYS = ["0s", "1.75s"] as const;

interface ActionButtonRingsProps {
  active: boolean;
  ringClassName?: string;
}

export function ActionButtonRings({
  active,
  ringClassName = "border-foreground",
}: ActionButtonRingsProps) {
  if (!active) return null;

  return (
    <>
      {RING_DELAYS.map((delay) => (
        <div
          key={delay}
          aria-hidden
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        >
          <span
            className={`size-14 shrink-0 rounded-xl border-2 box-border animate-action-ring-expand ${ringClassName}`}
            style={{ animationDelay: delay }}
          />
        </div>
      ))}
    </>
  );
}
