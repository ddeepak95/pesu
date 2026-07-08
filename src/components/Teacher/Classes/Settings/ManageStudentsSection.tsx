"use client";

import { useMemo, useState } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createStudentInvite,
  revokeStudentInvite,
} from "@/lib/queries/studentInvites";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  invalidateStudentInvitesCache,
  useStudentInvites,
} from "@/hooks/swr";

interface ManageStudentsSectionProps {
  classData: Class;
  canManageRoster: boolean;
}

export default function ManageStudentsSection({
  classData,
  canManageRoster,
}: ManageStudentsSectionProps) {
  const invitesQuery = useStudentInvites(classData.id);
  const invites = useMemo(() => invitesQuery.data ?? [], [invitesQuery.data]);

  const [busy, setBusy] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<string>("");

  const error = useMemo<string | null>(() => {
    const err = invitesQuery.error as
      | { code?: string; cause?: { code?: string } }
      | undefined;
    if (!err) return null;
    const code = err.code ?? err.cause?.code;
    if (code === "42P01") {
      return "Student management tables/functions are not installed yet. Run the Supabase student-invites migration.";
    }
    return "Failed to load student management data.";
  }, [invitesQuery.error]);

  const activeInvite = useMemo(() => {
    const now = Date.now();
    return (
      invites.find(
        (i) => !i.revoked_at && new Date(i.expires_at).getTime() > now,
      ) ?? null
    );
  }, [invites]);

  const inviteUrl = useMemo(() => {
    const token = activeInvite?.token || newInviteLink;
    if (!token) return "";
    return `${window.location.origin}/student/invites/${token}`;
  }, [activeInvite, newInviteLink]);

  const handleGenerateInvite = async () => {
    if (!canManageRoster) return;
    setBusy(true);
    try {
      const token = await createStudentInvite({ classDbId: classData.id });
      setNewInviteLink(token);
      await invalidateStudentInvitesCache();
    } catch (err) {
      console.error("Error creating invite:", err);
      showErrorToast("Failed to create invite.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    showSuccessToast("Invite link copied to clipboard.");
  };

  const handleRevokeInvite = async () => {
    if (!canManageRoster || !activeInvite) return;
    const confirmed = window.confirm("Revoke this invite link?");
    if (!confirmed) return;

    setBusy(true);
    try {
      await revokeStudentInvite(activeInvite.id);
      setNewInviteLink("");
      await invalidateStudentInvitesCache();
    } catch (err) {
      console.error("Error revoking invite:", err);
      showErrorToast("Failed to revoke invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Students</CardTitle>
        <CardDescription>
          Invite students with a reusable link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!canManageRoster && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only class owners, co-owners, and class admins can manage student
            invites.
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="studentInviteUrl">Invite link</Label>
              <Input
                id="studentInviteUrl"
                value={inviteUrl}
                readOnly
                placeholder={
                  activeInvite && !inviteUrl
                    ? "Invite exists but token not available. Regenerate to get a new link."
                    : "Generate an invite link..."
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyInvite}
              disabled={!inviteUrl}
            >
              Copy
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleGenerateInvite}
              disabled={!canManageRoster || busy}
            >
              {activeInvite ? "Regenerate invite" : "Generate invite"}
            </Button>
            {activeInvite && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleRevokeInvite}
                disabled={!canManageRoster || busy}
              >
                Revoke
              </Button>
            )}
          </div>
        </div>

        {activeInvite ? (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Expires: {new Date(activeInvite.expires_at).toLocaleString()} •
            Uses: {activeInvite.uses}
            {activeInvite.max_uses === null ? "" : `/${activeInvite.max_uses}`}
          </div>
        ) : (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            No active invite. Generate one to invite students.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
