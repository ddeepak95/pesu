"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInstitutionAdminInvite,
  revokeInstitutionAdminInvite,
} from "@/lib/queries/institutionAdminInvites";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  invalidateInstitutionAdminInviteCache,
  useInstitutionAdminInvite,
} from "@/hooks/swr";

interface ManageInstitutionAdminInviteProps {
  institutionId: string;
}

/**
 * Renders the institution-admin invite-link management UI: copy, regenerate,
 * revoke. Mirrors the teacher-invite block in `ManageTeachersSection` but
 * scoped to a single institution.
 *
 * Permission to act on the invite is enforced by the underlying RPCs (super
 * admin OR institution admin). The component is always rendered for those
 * viewers; non-admins won't see the parent Admins card at all.
 */
export default function ManageInstitutionAdminInvite({
  institutionId,
}: ManageInstitutionAdminInviteProps) {
  const { data: invite, error } = useInstitutionAdminInvite(institutionId);
  const [newInviteToken, setNewInviteToken] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const activeInvite = useMemo(() => {
    if (!invite) return null;
    if (invite.revoked_at) return null;
    if (new Date(invite.expires_at).getTime() <= Date.now()) return null;
    return invite;
  }, [invite]);

  const inviteUrl = useMemo(() => {
    const token = activeInvite?.token || newInviteToken;
    if (!token) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/admin/invites/${token}`;
  }, [activeInvite, newInviteToken]);

  const loadError = useMemo<string | null>(() => {
    if (!error) return null;
    const err = error as { code?: string; cause?: { code?: string } };
    const code = err.code ?? err.cause?.code;
    if (code === "42P01") {
      return "Institution invite tables/functions are not installed yet. Run the Supabase institution-admin-invites migration.";
    }
    return "Failed to load invite data.";
  }, [error]);

  const handleGenerate = () => {
    startTransition(async () => {
      try {
        const token = await createInstitutionAdminInvite({ institutionId });
        setNewInviteToken(token);
        await invalidateInstitutionAdminInviteCache();
        showSuccessToast(
          activeInvite ? "Invite link regenerated." : "Invite link created.",
        );
      } catch (err) {
        console.error("Error creating institution-admin invite:", err);
        showErrorToast(
          err instanceof Error
            ? err.message
            : "Failed to create invite link.",
        );
      }
    });
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      showSuccessToast("Invite link copied to clipboard.");
    } catch {
      showErrorToast("Could not copy link.");
    }
  };

  const handleRevoke = () => {
    if (!activeInvite) return;
    const confirmed = window.confirm("Revoke this invite link?");
    if (!confirmed) return;
    startTransition(async () => {
      try {
        await revokeInstitutionAdminInvite(activeInvite.id);
        setNewInviteToken("");
        await invalidateInstitutionAdminInviteCache();
        showSuccessToast("Invite link revoked.");
      } catch (err) {
        console.error("Error revoking institution-admin invite:", err);
        showErrorToast(
          err instanceof Error ? err.message : "Failed to revoke invite.",
        );
      }
    });
  };

  return (
    <div className="space-y-4 rounded border p-4">
      <div>
        <h3 className="text-sm font-medium">Invite link</h3>
        <p className="text-xs text-muted-foreground">
          Share this link to add anyone with an account as an admin of this
          institution. The link can be regenerated or revoked at any time.
        </p>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor={`invite-url-${institutionId}`}>URL</Label>
            <Input
              id={`invite-url-${institutionId}`}
              value={inviteUrl}
              readOnly
              placeholder={
                activeInvite && !inviteUrl
                  ? "Invite exists but token not available. Regenerate to get a new link."
                  : "No invite link yet — generate one to get started."
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            disabled={!inviteUrl}
          >
            Copy
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {activeInvite ? "Regenerate link" : "Generate link"}
          </Button>
          {activeInvite && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={isPending}
            >
              Revoke
            </Button>
          )}
        </div>

        {activeInvite && (
          <p className="text-xs text-muted-foreground">
            Uses: {activeInvite.uses}
            {activeInvite.max_uses === null
              ? ""
              : `/${activeInvite.max_uses}`}
          </p>
        )}
      </div>
    </div>
  );
}
