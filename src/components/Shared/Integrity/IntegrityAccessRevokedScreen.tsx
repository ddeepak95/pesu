"use client";

import { getIntegrityRevokedLabel } from "@/lib/integrity/reasonLabels";

interface IntegrityAccessRevokedScreenProps {
  reasonCode: string | null | undefined;
  title?: string;
}

export function IntegrityAccessRevokedScreen({
  reasonCode,
  title = "Access suspended",
}: IntegrityAccessRevokedScreenProps) {
  const label = getIntegrityRevokedLabel(reasonCode);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-3 rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Your access to this assessment has been suspended: {label}.
        </p>
        <p className="text-sm text-muted-foreground">
          Contact your instructor if you need to continue.
        </p>
      </div>
    </div>
  );
}
