"use client";

import { useMemo, useState } from "react";
import { Class, type ClassTeacherRole } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import List from "@/components/ui/List";
import {
  removeCoTeacher,
  transferClassPrimaryOwner,
  updateClassTeacherRole,
  type ClassTeacherWithUserInfo,
} from "@/lib/queries/classTeachers";
import {
  createTeacherInvite,
  revokeTeacherInvite,
  type ClassTeacherInvite,
} from "@/lib/queries/teacherInvites";
import {
  logPostgrestError,
  userFacingPostgrestMessage,
} from "@/lib/postgrestError";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  invalidateClassTeachersCache,
  invalidateTeacherInvitesCache,
  useClassTeachers,
  useTeacherInvites,
} from "@/hooks/swr";

function roleLabel(role: ClassTeacherRole): string {
  switch (role) {
    case "owner":
      return "Primary owner";
    case "co-owner":
      return "Co-owner";
    case "admin":
      return "Class admin";
    case "co-teacher":
      return "Co-teacher";
    default:
      return role;
  }
}

function roleOptionsForRow(
  row: ClassTeacherWithUserInfo,
  assignableRoles: ClassTeacherRole[],
): ClassTeacherRole[] {
  const s = new Set<ClassTeacherRole>(assignableRoles);
  s.add(row.role);
  return Array.from(s);
}

interface InviteLinkBlockProps {
  classDbId: string;
  role: "owner" | "co-teacher";
  title: string;
  invites: ClassTeacherInvite[];
  canManageRoster: boolean;
  emptyHint: string;
}

/**
 * One invite link, bound server-side to a single role (`owner` or
 * `co-teacher`) — the role can never be changed by whoever accepts it.
 * Rendered twice by `ManageTeachersSection`, once per role, each managing
 * its own generate/copy/revoke state independently.
 */
function InviteLinkBlock({
  classDbId,
  role,
  title,
  invites,
  canManageRoster,
  emptyHint,
}: InviteLinkBlockProps) {
  const [busy, setBusy] = useState(false);
  const [newInviteLink, setNewInviteLink] = useState<string>("");

  const activeInvite = useMemo(() => {
    const now = Date.now();
    return (
      invites.find(
        (i) =>
          i.intended_role === role &&
          !i.revoked_at &&
          new Date(i.expires_at).getTime() > now,
      ) ?? null
    );
  }, [invites, role]);

  const inviteUrl = useMemo(() => {
    const token = activeInvite?.token || newInviteLink;
    if (!token) return "";
    return `${window.location.origin}/teacher/invites/${token}`;
  }, [activeInvite, newInviteLink]);

  const generateLabel = activeInvite
    ? role === "owner"
      ? "Regenerate primary teacher invite"
      : "Regenerate invite"
    : role === "owner"
      ? "Invite primary teacher"
      : "Generate invite";

  const handleGenerateInvite = async () => {
    if (!canManageRoster) return;
    setBusy(true);
    try {
      const token = await createTeacherInvite({ classDbId, role });
      setNewInviteLink(token);
      await invalidateTeacherInvitesCache();
    } catch (err) {
      logPostgrestError("Error creating invite", err);
      showErrorToast(
        userFacingPostgrestMessage(err, "Failed to create invite."),
      );
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
      await revokeTeacherInvite(activeInvite.id);
      setNewInviteLink("");
      await invalidateTeacherInvitesCache();
    } catch (err) {
      logPostgrestError("Error revoking invite", err);
      showErrorToast(
        userFacingPostgrestMessage(err, "Failed to revoke invite."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor={`inviteUrl-${role}`}>Invite link</Label>
          <Input
            id={`inviteUrl-${role}`}
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
          {generateLabel}
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

      {activeInvite ? (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          Expires: {new Date(activeInvite.expires_at).toLocaleString()} •
          Uses: {activeInvite.uses}
          {activeInvite.max_uses === null ? "" : `/${activeInvite.max_uses}`}
        </div>
      ) : (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}
    </div>
  );
}

interface ManageTeachersSectionProps {
  classData: Class;
  canManageRoster: boolean;
  canPromoteCoOwner: boolean;
  /** Platform super admin or institution admin: transfer `class_teachers.owner`. */
  canTransferPrimaryOwnership?: boolean;
  onTeachersChanged?: () => void;
}

export default function ManageTeachersSection({
  classData,
  canManageRoster,
  canPromoteCoOwner,
  canTransferPrimaryOwnership = false,
  onTeachersChanged,
}: ManageTeachersSectionProps) {
  const teachersQuery = useClassTeachers(classData.id);
  const invitesQuery = useTeacherInvites(classData.id);

  const teachers = useMemo(
    () => teachersQuery.data ?? [],
    [teachersQuery.data],
  );
  const invites = useMemo(() => invitesQuery.data ?? [], [invitesQuery.data]);

  const [rosterBusy, setRosterBusy] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [transferBusyId, setTransferBusyId] = useState<string | null>(null);
  const [pendingPrimaryTransfer, setPendingPrimaryTransfer] = useState<{
    teacherId: string;
    displayLabel: string;
  } | null>(null);

  const hasOwner = useMemo(
    () => teachers.some((t) => t.role === "owner"),
    [teachers],
  );

  const assignableRoles = useMemo((): ClassTeacherRole[] => {
    const r: ClassTeacherRole[] = ["co-teacher", "admin"];
    if (canPromoteCoOwner) r.push("co-owner");
    return r;
  }, [canPromoteCoOwner]);

  const currentPrimaryOwnerLabel = useMemo(() => {
    const row = teachers.find((t) => t.role === "owner");
    if (!row) return "the current primary owner";
    return row.teacher_display_name || row.teacher_email || row.teacher_id;
  }, [teachers]);

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

  const handleRemoveTeacher = async (teacherId: string) => {
    if (!canManageRoster) return;
    const confirmed = window.confirm("Remove this teacher from the class?");
    if (!confirmed) return;

    setRosterBusy(true);
    try {
      await removeCoTeacher({ classDbId: classData.id, teacherId });
      await invalidateClassTeachersCache();
    } catch (err) {
      console.error("Error removing teacher:", err);
      showErrorToast("Failed to remove teacher.");
    } finally {
      setRosterBusy(false);
    }
  };

  const handleRoleChange = async (
    teacherId: string,
    next: ClassTeacherRole,
    row: ClassTeacherWithUserInfo,
  ) => {
    if (!canManageRoster || row.role === "owner") return;
    if (next === row.role) return;
    if (
      !canPromoteCoOwner &&
      (next === "co-owner" || row.role === "co-owner")
    ) {
      showErrorToast("You cannot change co-owner roles.");
      return;
    }
    setRoleBusyId(teacherId);
    try {
      await updateClassTeacherRole({
        classDbId: classData.id,
        teacherId,
        role: next,
      });
      await invalidateClassTeachersCache();
    } catch (err) {
      console.error("Error updating role:", err);
      showErrorToast("Failed to update role.");
    } finally {
      setRoleBusyId(null);
    }
  };

  const openPrimaryTransferDialog = (
    teacherId: string,
    displayLabel: string,
  ) => {
    if (!canTransferPrimaryOwnership) return;
    setPendingPrimaryTransfer({ teacherId, displayLabel });
  };

  const confirmPrimaryTransfer = async () => {
    if (!pendingPrimaryTransfer || !canTransferPrimaryOwnership) return;
    const { teacherId } = pendingPrimaryTransfer;
    setTransferBusyId(teacherId);
    try {
      await transferClassPrimaryOwner({
        classDbId: classData.id,
        newOwnerTeacherId: teacherId,
        demotePreviousTo: "co-owner",
      });
      await invalidateClassTeachersCache();
      showSuccessToast("Primary owner updated.");
      setPendingPrimaryTransfer(null);
      onTeachersChanged?.();
    } catch (err) {
      console.error("Error transferring primary owner:", err);
      showErrorToast("Failed to transfer primary owner.");
    } finally {
      setTransferBusyId(null);
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
          Invite teachers with a reusable link, assign roles, and remove
          teachers who should no longer access this class.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!canManageRoster && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only class owners, co-owners, and class admins can manage teachers.
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!hasOwner && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            This class doesn&apos;t have a primary teacher yet. The first
            person to accept the primary teacher invite becomes the primary
            teacher — share it with them first (or alone) before forwarding
            the co-teacher invite to anyone else.
          </div>
        )}

        {!hasOwner && (
          <InviteLinkBlock
            classDbId={classData.id}
            role="owner"
            title="Primary teacher invite"
            invites={invites}
            canManageRoster={canManageRoster}
            emptyHint="Generate a link and share it with the person who should be the primary teacher."
          />
        )}

        <InviteLinkBlock
          classDbId={classData.id}
          role="co-teacher"
          title="Co-teacher invite"
          invites={invites}
          canManageRoster={canManageRoster}
          emptyHint="No active invite. Generate one to invite co-teachers (they join as co-teachers; you can promote them afterward)."
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-medium">Teachers</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={rosterBusy}
            >
              Refresh
            </Button>
          </div>
          <List
            items={teachers}
            emptyMessage="No teachers found."
            renderItem={(t) => {
              const displayName =
                t.teacher_display_name || t.teacher_email || t.teacher_id;
              const showEmailUnderName =
                t.teacher_email && t.teacher_display_name;

              const creatorNote =
                t.teacher_id === classData.created_by ? " · Creator" : "";

              const opts = roleOptionsForRow(t, assignableRoles);

              return (
                <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {displayName}
                    </div>
                    {showEmailUnderName && (
                      <div className="text-xs text-muted-foreground truncate">
                        {t.teacher_email}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {roleLabel(t.role)}
                      {creatorNote}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {t.role !== "owner" && canTransferPrimaryOwnership && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          openPrimaryTransferDialog(t.teacher_id, displayName)
                        }
                        disabled={
                          rosterBusy ||
                          transferBusyId !== null ||
                          roleBusyId === t.teacher_id
                        }
                      >
                        {transferBusyId === t.teacher_id
                          ? "Working…"
                          : "Make primary owner"}
                      </Button>
                    )}
                    {t.role !== "owner" && canManageRoster && (
                      <Select
                        value={t.role}
                        onValueChange={(v) =>
                          handleRoleChange(
                            t.teacher_id,
                            v as ClassTeacherRole,
                            t,
                          )
                        }
                        disabled={
                          rosterBusy ||
                          roleBusyId === t.teacher_id ||
                          (!canPromoteCoOwner && t.role === "co-owner")
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {opts.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {t.role !== "owner" && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveTeacher(t.teacher_id)}
                        disabled={!canManageRoster || rosterBusy}
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

        <Dialog
          open={pendingPrimaryTransfer !== null}
          onOpenChange={(next) => {
            if (!next && transferBusyId === null) {
              setPendingPrimaryTransfer(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transfer primary owner?</DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  {pendingPrimaryTransfer ? (
                    <>
                      <strong className="font-medium text-foreground">
                        {pendingPrimaryTransfer.displayLabel}
                      </strong>{" "}
                      will become the primary owner, and{" "}
                      <strong className="font-medium text-foreground">
                        {currentPrimaryOwnerLabel}
                      </strong>{" "}
                      will become a co-owner.
                    </>
                  ) : null}
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingPrimaryTransfer(null)}
                disabled={transferBusyId !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void confirmPrimaryTransfer()}
                disabled={
                  transferBusyId !== null || pendingPrimaryTransfer === null
                }
              >
                {pendingPrimaryTransfer &&
                transferBusyId === pendingPrimaryTransfer.teacherId
                  ? "Working…"
                  : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
