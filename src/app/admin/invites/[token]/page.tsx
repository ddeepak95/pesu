"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import { acceptInstitutionAdminInvite } from "@/lib/queries/institutionAdminInvites";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

type InviteStatus = "pending" | "accepting" | "success" | "error";

/**
 * Accept page for institution-admin invite links. Mirrors the teacher
 * accept page at `/teacher/invites/[token]`. On success the user is added
 * (or no-op'd if already a member) and redirected to the institution
 * detail page.
 */
export default function AcceptInstitutionAdminInvitePage() {
  const params = useParams();
  const router = useTrackedRouter();
  const token = params.token as string;
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<InviteStatus>("pending");
  const [error, setError] = useState<string>("");

  const handleAcceptInvite = async () => {
    setStatus("accepting");
    setError("");

    try {
      const institutionId = await acceptInstitutionAdminInvite(token);
      setStatus("success");
      setTimeout(() => {
        router.push(`/admin/institutions/${institutionId}?tab=settings`);
      }, 1500);
    } catch (err: unknown) {
      console.error("Error accepting institution admin invite:", err);
      setStatus("error");
      const message =
        typeof err === "object" && err !== null
          ? ((err as Record<string, unknown>)["message"] as string | undefined)
          : undefined;
      setError(
        message ||
          "Failed to accept invite. The link may be invalid or expired.",
      );
    }
  };

  const handleDecline = () => {
    router.push("/admin");
  };

  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          {status === "pending" && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Institution admin invitation</CardTitle>
                <CardDescription>
                  You&apos;ve been invited to join an institution as an admin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Signed in as{" "}
                  <span className="font-medium">{user.email}</span>
                </p>
                <div className="flex flex-col gap-3">
                  <Button onClick={handleAcceptInvite} className="w-full">
                    Accept invitation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDecline}
                    className="w-full"
                  >
                    Decline
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {status === "accepting" && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Accepting invitation</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">Please wait…</p>
              </CardContent>
            </>
          )}

          {status === "success" && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Welcome</CardTitle>
                <CardDescription>
                  You now have admin access to this institution.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Redirecting to the institution…
                </p>
                <Button variant="outline" onClick={() => router.push("/admin")}>
                  Go to my institutions
                </Button>
              </CardContent>
            </>
          )}

          {status === "error" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-destructive">
                  Unable to accept
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-destructive text-sm">{error}</p>
                <div className="flex flex-col gap-3">
                  <Button onClick={handleAcceptInvite} variant="outline">
                    Try again
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => router.push("/admin")}
                  >
                    Go to my institutions
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
