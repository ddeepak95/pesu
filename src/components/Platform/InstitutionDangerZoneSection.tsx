"use client";

import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deleteOrArchiveInstitutionAction,
  restoreInstitutionAction,
} from "@/app/platform/actions";
import type { Institution } from "@/lib/queries/institutions";

interface InstitutionDangerZoneSectionProps {
  institution: Institution;
}

/**
 * Super-admin-only danger zone for an institution. Mirrors the class
 * `DangerZoneSection` styling. A single "Delete institution" action branches
 * server-side: hard delete if the institution has no classes, otherwise
 * archive (reversible) instead — the FK on `classes.institution_id` would
 * block a hard delete anyway if classes exist.
 */
export default function InstitutionDangerZoneSection({
  institution,
}: InstitutionDangerZoneSectionProps) {
  if (institution.is_default) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            The default institution can&apos;t be deleted or archived.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (institution.status === "archived") {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            This institution is archived and hidden from normal use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={restoreInstitutionAction}
            className="flex items-center justify-between gap-4"
          >
            <input type="hidden" name="institutionId" value={institution.id} />
            <div className="space-y-1">
              <p className="text-sm font-medium">Restore this institution</p>
              <p className="text-sm text-muted-foreground">
                Brings the institution back to active status.
              </p>
            </div>
            <Button type="submit" variant="outline">
              Restore institution
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    const confirmed = window.confirm(
      "If this institution has no classes it will be permanently deleted; otherwise it will be archived instead. Continue?"
    );
    if (!confirmed) {
      e.preventDefault();
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions that affect this institution.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          action={deleteOrArchiveInstitutionAction}
          className="flex items-center justify-between gap-4"
        >
          <input type="hidden" name="institutionId" value={institution.id} />
          <div className="space-y-1">
            <p className="text-sm font-medium">Delete this institution</p>
            <p className="text-sm text-muted-foreground">
              Deletes the institution if it has no classes; otherwise
              archives it (reversible) instead.
            </p>
          </div>
          <Button type="submit" variant="destructive">
            Delete institution
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
