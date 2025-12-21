"use client";

import { useEffect, useMemo, useState } from "react";
import { Class, ClassTeacher } from "@/types/class";
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
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import {
  listClassTeachers,
  removeCoTeacher,
} from "@/lib/queries/classTeachers";
import {
  ClassTeacherInvite,
  createTeacherInvite,
  listTeacherInvites,
  revokeTeacherInvite,
} from "@/lib/queries/teacherInvites";

export default function ManageTeachersDialog({
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<ClassTeacher[]>([]);
  const [invites, setInvites] = useState<ClassTeacherInvite[]>([]);
  const [newInviteLink, setNewInviteLink] = useState<string>("");

  const activeInvite = useMemo(() => {
    const now = Date.now();
    return (
      invites.find(
        (i) => !i.revoked_at && new Date(i.expires_at).getTime() > now
      ) ?? null
    );
  }, [invites]);

  const inviteUrl = useMemo(() => {
    // Use token from activeInvite if available, otherwise use newly generated token
    const token = activeInvite?.token || newInviteLink;
    if (!token) return "";
    return `${window.location.origin}/teacher/invites/${token}`;
  }, [activeInvite, newInviteLink]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, i] = await Promise.all([
        listClassTeachers(classData.id),
        listTeacherInvites(classData.id),
      ]);
      setTeachers(t);
      setInvites(i);
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null
          ? (err as Record<string, unknown>)["code"] ||
            (typeof (err as Record<string, unknown>)["cause"] === "object" &&
            (err as Record<string, unknown>)["cause"] !== null
              ? (
                  (err as Record<string, unknown>)["cause"] as Record<
                    string,
                    unknown
                  >
                )["code"]
              : undefined)
          : undefined;
      if (code === "42P01") {
        setError(
          "Teacher management tables/functions are not installed yet. Run the Supabase teacher-invites migration."
        );
      } else {
        console.error("Error loading teacher management data:", err);
        setError("Failed to load teacher management data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setNewInviteLink(""); // Clear newly generated token when dialog opens
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleGenerateInvite = async () => {
    if (!isOwner) return;
    setLoading(true);
    setError(null);
    try {
      const token = await createTeacherInvite({
        classDbId: classData.id,
      });
      setNewInviteLink(token);
      await refresh();
    } catch (err) {
      console.error("Error creating invite:", err);
      setError("Failed to create invite.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    alert("Invite link copied to clipboard.");
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!isOwner) return;
    const confirmed = window.confirm("Revoke this invite link?");
    if (!confirmed) return;

    setLoading(true);
    try {
      await revokeTeacherInvite(inviteId);
      setNewInviteLink("");
      await refresh();
    } catch (err) {
      console.error("Error revoking invite:", err);
      alert("Failed to revoke invite.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTeacher = async (teacherId: string) => {
    if (!isOwner) return;
    const confirmed = window.confirm("Remove this co-teacher from the class?");
    if (!confirmed) return;

    setLoading(true);
    try {
      await removeCoTeacher({ classDbId: classData.id, teacherId });
      await refresh();
    } catch (err) {
      console.error("Error removing teacher:", err);
      alert("Failed to remove co-teacher.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage teachers</DialogTitle>
          <DialogDescription>
            Add co-teachers via a single reusable invite link, and remove
            existing co-teachers.
          </DialogDescription>
        </DialogHeader>

        {!isOwner && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only the class owner can manage teachers.
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
            <Button
              type="button"
              onClick={handleGenerateInvite}
              disabled={!isOwner || loading}
            >
              {activeInvite ? "Regenerate invite" : "Generate invite"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={loading}
            >
              Refresh
            </Button>
            {activeInvite && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleRevokeInvite(activeInvite.id)}
                disabled={!isOwner || loading}
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
              No active invite. Generate one to invite co-teachers.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Teachers</h3>
          <List
            items={teachers}
            emptyMessage="No teachers found."
            renderItem={(t) => (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {t.teacher_id}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {t.role}
                  </div>
                </div>
                <div className="flex gap-2">
                  {t.role === "co-teacher" && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveTeacher(t.teacher_id)}
                      disabled={!isOwner || loading}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}
          />
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
