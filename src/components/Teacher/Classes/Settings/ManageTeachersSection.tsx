"use client";

import { useState, useMemo } from "react";
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
import List from "@/components/ui/List";
import { useAuth } from "@/contexts/AuthContext";
import { removeCoTeacher } from "@/lib/queries/classTeachers";
import {
  createTeacherInvite,
  revokeTeacherInvite,
} from "@/lib/queries/teacherInvites";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  invalidateClassTeachersCache,
  invalidateTeacherInvitesCache,
  useClassTeachers,
  useTeacherInvites,
} from "@/hooks/swr";

interface ManageTeachersSectionProps {
  classData: Class;
  isOwner: boolean;
}

export default function ManageTeachersSection({
  classData,
  isOwner,
}: ManageTeachersSectionProps) {
  const { user: _user } = useAuth();

  const teachersQuery = useClassTeachers(classData.id);
  const invitesQuery = useTeacherInvites(classData.id);

  const teachers = useMemo(
    () => teachersQuery.data ?? [],
    [teachersQuery.data]
  );
  const invites = useMemo(
    () => invitesQuery.data ?? [],
    [invitesQuery.data]
  );

  const [busy, setBusy] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<string>("");

  const error = useMemo<string | null>(() => {
    const err = (teachersQuery.error || invitesQuery.error) as
      | { code?: string; cause?: { code?: string } }
      | undefined;
    if (!err) return null;
    const code = err.code ?? err.cause?.code;
    if (code === "42P01") {
      return "Teacher management tables/functions are not installed yet. Run the Supabase teacher-invites migration.";
    }
    return "Failed to load teacher management data.";
  }, [teachersQuery.error, invitesQuery.error]);

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
    return `${window.location.origin}/teacher/invites/${token}`;
  }, [activeInvite, newInviteLink]);

  const handleGenerateInvite = async () => {
    if (!isOwner) return;
    setBusy(true);
    try {
      const token = await createTeacherInvite({
        classDbId: classData.id,
      });
      setNewInviteLink(token);
      await invalidateTeacherInvitesCache();
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

  const handleRevokeInvite = async (inviteId: string) => {
    if (!isOwner) return;
    const confirmed = window.confirm("Revoke this invite link?");
    if (!confirmed) return;

    setBusy(true);
    try {
      await revokeTeacherInvite(inviteId);
      setNewInviteLink("");
      await invalidateTeacherInvitesCache();
    } catch (err) {
      console.error("Error revoking invite:", err);
      showErrorToast("Failed to revoke invite.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveTeacher = async (teacherId: string) => {
    if (!isOwner) return;
    const confirmed = window.confirm("Remove this co-teacher from the class?");
    if (!confirmed) return;

    setBusy(true);
    try {
      await removeCoTeacher({ classDbId: classData.id, teacherId });
      await invalidateClassTeachersCache();
    } catch (err) {
      console.error("Error removing teacher:", err);
      showErrorToast("Failed to remove co-teacher.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    await Promise.all([
      invalidateClassTeachersCache(),
      invalidateTeacherInvitesCache(),
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teachers</CardTitle>
        <CardDescription>
          Add co-teachers via a single reusable invite link, and remove existing
          co-teachers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              disabled={!isOwner || busy}
            >
              {activeInvite ? "Regenerate invite" : "Generate invite"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={busy}
            >
              Refresh
            </Button>
            {activeInvite && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleRevokeInvite(activeInvite.id)}
                disabled={!isOwner || busy}
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
            renderItem={(t) => {
              const displayName =
                t.teacher_display_name || t.teacher_email || t.teacher_id;
              const showEmailUnderName =
                t.teacher_email && t.teacher_display_name;

              return (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {displayName}
                    </div>
                    {showEmailUnderName && (
                      <div className="text-xs text-muted-foreground truncate">
                        {t.teacher_email}
                      </div>
                    )}
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
                        disabled={!isOwner || busy}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
