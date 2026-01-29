"use client";

import { useEffect, useMemo, useState } from "react";
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
  ClassStudentInvite,
  createStudentInvite,
  listStudentInvites,
  revokeStudentInvite,
} from "@/lib/queries/studentInvites";
import { createClient } from "@/lib/supabase";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

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
  const [isTeacher, setIsTeacher] = useState(false);
  const isOwner = user?.id === classData.created_by;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<ClassStudentInvite[]>([]);
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
    return `${window.location.origin}/students/invites/${token}`;
  }, [activeInvite, newInviteLink]);

  // Check if user is a co-teacher
  useEffect(() => {
    const checkTeacherStatus = async () => {
      if (!user || isOwner) {
        setIsTeacher(isOwner);
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("class_teachers")
          .select("id")
          .eq("class_id", classData.id)
          .eq("teacher_id", user.id)
          .single();

        setIsTeacher(!error && data !== null);
      } catch {
        setIsTeacher(false);
      }
    };

    if (open && user) {
      checkTeacherStatus();
    }
  }, [open, user, classData.id, isOwner]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch invites
      const i = await listStudentInvites(classData.id);
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
          "Student management tables/functions are not installed yet. Run the Supabase student-invites migration."
        );
      } else {
        console.error("Error loading student management data:", err);
        setError("Failed to load student management data.");
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
    if (!isTeacher) return;
    setLoading(true);
    setError(null);
    try {
      const token = await createStudentInvite({
        classDbId: classData.id,
      });
      setNewInviteLink(token);
      await refresh();
      showSuccessToast("Invite link generated");
    } catch (err) {
      console.error("Error creating invite:", err);
      showErrorToast("Failed to create invite");
    } finally {
      setLoading(false);
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

    setLoading(true);
    try {
      await revokeStudentInvite(inviteId);
      setNewInviteLink("");
      await refresh();
      showSuccessToast("Invite revoked successfully");
    } catch (err) {
      console.error("Error revoking invite:", err);
      showErrorToast("Failed to revoke invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Button
              type="button"
              onClick={handleGenerateInvite}
              disabled={!isTeacher || loading}
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
                disabled={!isTeacher || loading}
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

