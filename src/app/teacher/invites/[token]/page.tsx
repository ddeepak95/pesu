"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { acceptTeacherInvite } from "@/lib/queries/teacherInvites";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/ui/back-button";

export default function AcceptTeacherInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      try {
        const classPublicId = await acceptTeacherInvite(token);
        setStatus("success");
        // Redirect to class page shortly after
        setTimeout(() => {
          router.push(`/teacher/classes/${classPublicId}`);
        }, 500);
      } catch (err: unknown) {
        console.error("Error accepting teacher invite:", err);
        setStatus("error");
        const message =
          typeof err === "object" && err !== null
            ? ((err as Record<string, unknown>)["message"] as
                | string
                | undefined)
            : undefined;
        setError(message || "Failed to accept invite.");
      }
    };

    if (token) run();
  }, [token, router]);

  return (
    <PageLayout>
      <div className="p-8 max-w-xl mx-auto">
        <div className="mb-4">
          <BackButton label="Back" />
        </div>
        {status === "loading" && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Accepting invite…</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">
              Invite accepted. Redirecting…
            </p>
            <Button
              variant="outline"
              onClick={() => router.push("/teacher/classes")}
            >
              Go to classes
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-12 space-y-4">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              onClick={() => router.push("/teacher/classes")}
            >
              Go to classes
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
