"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { createClassForInstitution } from "@/lib/queries/classes";
import { showSuccessToast } from "@/lib/toast";
import ClassForm from "@/components/Teacher/Classes/ClassForm";

interface CreateInstitutionClassProps {
  institutionId: string;
  /** Base path for the class settings drill-down; `/{classDbId}` is appended. */
  classSettingsHrefBase: string;
}

interface JustCreatedClass {
  classId: string;
  name: string;
  inviteToken: string;
}

export default function CreateInstitutionClass({
  institutionId,
  classSettingsHrefBase,
}: CreateInstitutionClassProps) {
  const [open, setOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<JustCreatedClass | null>(
    null
  );
  const router = useTrackedRouter();

  const handleSubmit = async (data: {
    name: string;
    preferredLanguage: string;
  }) => {
    const created = await createClassForInstitution(
      institutionId,
      data.name,
      data.preferredLanguage
    );
    setJustCreated({
      classId: created.classData.id,
      name: created.classData.name,
      inviteToken: created.primaryInviteToken,
    });
  };

  const inviteUrl = justCreated
    ? `${window.location.origin}/teacher/invites/${justCreated.inviteToken}`
    : "";

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    showSuccessToast("Invite link copied to clipboard.");
  };

  const handleGoToSettings = () => {
    if (!justCreated) return;
    router.push(`${classSettingsHrefBase}/${justCreated.classId}`);
  };

  return (
    <>
      <ClassForm
        mode="create"
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        triggerButton={<Button>Create Class</Button>}
      />

      <Dialog
        open={justCreated !== null}
        onOpenChange={(next) => {
          if (!next) setJustCreated(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Class created</DialogTitle>
            <DialogDescription>
              Share this link with the person who should be the primary
              teacher for &ldquo;{justCreated?.name}&rdquo;. Whoever accepts
              it becomes the primary teacher.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-end gap-2">
            <Input readOnly value={inviteUrl} />
            <Button type="button" variant="outline" onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleGoToSettings}>
              Go to class settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
