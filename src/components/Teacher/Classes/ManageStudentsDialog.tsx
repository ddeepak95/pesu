"use client";

import { useState, useMemo } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  createStudentInvite,
  revokeStudentInvite,
} from "@/lib/queries/studentInvites";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import {
  invalidateStudentInvitesCache,
  useIsCoTeacherForClass,
  useStudentInvites,
} from "@/hooks/swr";

export default function ManageStudentsDialog({
  classData,
  open,
  onOpenChange,
}: {
  classData: Class;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const isOwner = user?.id === classData.created_by;

  const coTeacherQuery = useIsCoTeacherForClass(
    open && user && !isOwner ? classData.id : null,
    user?.id ?? null
  );
  const isTeacher = isOwner || !!coTeacherQuery.data;

  const invitesQuery = useStudentInvites(open ? classData.id : null);
  const invites = useMemo(
    () => invitesQuery.data ?? [],
    [invitesQuery.data]
  );

  const [busy, setBusy] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<string>("");

  const error = useMemo<string | null>(() => {
    const err = invitesQuery.error as { code?: string; cause?: { code?: string } } | undefined;
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
        (i) => !i.revoked_at && new Date(i.expires_at).getTime() > now
      ) ?? null
    );
  }, [invites]);

  const inviteUrl = useMemo(() => {
    const token = activeInvite?.token || newInviteLink;
    if (!token) return "";
    return `${window.location.origin}/student/invites/${token}`;
  }, [activeInvite, newInviteLink]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setNewInviteLink("");
    }
    onOpenChange(next);
  };

  const handleGenerateInvite = async () => {
    if (!isTeacher) return;
    setBusy(true);
    try {
      const token = await createStudentInvite({
        classDbId: classData.id,
      });
      setNewInviteLink(token);
      await invalidateStudentInvitesCache();
      showSuccessToast("Invite link generated");
    } catch (err) {
      console.error("Error creating invite:", err);
      showErrorToast("Failed to create invite");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    showSuccessToast("Invite link copied to clipboard");
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!isTeacher) return;
    const confirmed = window.confirm("Revoke this invite link?");
    if (!confirmed) return;

    setBusy(true);
    try {
      await revokeStudentInvite(inviteId);
      setNewInviteLink("");
      await invalidateStudentInvitesCache();
      showSuccessToast("Invite revoked successfully");
    } catch (err) {
      console.error("Error revoking invite:", err);
      showErrorToast("Failed to revoke invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Students</DialogTitle>
          <DialogDescription>
            Generate a reusable invite link to add students to this class.
          </DialogDescription>
        </DialogHeader>

        {!isTeacher && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only class owners and co-teachers can manage students.
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="inviteUrl">Invite link</Label>
              <Input
                id="inviteUrl"
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
            {((isTeacher && !activeInvite) || (isOwner && activeInvite)) && (
              <Button
                type="button"
                onClick={handleGenerateInvite}
                disabled={busy || (activeInvite ? !isOwner : !isTeacher)}
              >
                {activeInvite ? "Regenerate invite" : "Generate invite"}
              </Button>
            )}
            {activeInvite && isOwner && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleRevokeInvite(activeInvite.id)}
                disabled={busy}
              >
                Revoke
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Invite status</h3>
          {activeInvite ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              Expires: {new Date(activeInvite.expires_at).toLocaleString()} •
              Uses: {activeInvite.uses}
              {activeInvite.max_uses === null
                ? ""
                : `/${activeInvite.max_uses}`}
            </div>
          ) : (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              No active invite. Generate one to invite students.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
