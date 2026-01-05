"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { acceptStudentInvite } from "@/lib/queries/studentInvites";
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

export default function AcceptStudentInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<InviteStatus>("pending");
  const [error, setError] = useState<string>("");

  const handleAcceptInvite = async () => {
    setStatus("accepting");
    setError("");

    try {
      const classPublicId = await acceptStudentInvite(token);
      setStatus("success");
      // Redirect to class page after a brief moment
      setTimeout(() => {
        router.push(`/students/classes/${classPublicId}`);
      }, 1500);
    } catch (err: unknown) {
      console.error("Error accepting student invite:", err);
      setStatus("error");
      const message =
        typeof err === "object" && err !== null
          ? ((err as Record<string, unknown>)["message"] as string | undefined)
          : undefined;
      setError(
        message ||
          "Failed to accept invite. The link may be invalid or expired."
      );
    }
  };

  const handleDecline = () => {
    router.push("/students/classes");
  };

  // Show loading while checking auth (middleware handles redirect if not authenticated)
  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          {status === "pending" && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Student Invitation</CardTitle>
                <CardDescription>
                  You&apos;ve been invited to join a class as a student
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Signed in as <span className="font-medium">{user.email}</span>
                </p>
                <div className="flex flex-col gap-3">
                  <Button onClick={handleAcceptInvite} className="w-full">
                    Accept Invitation
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
                <CardTitle>Accepting Invitation</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">Please wait…</p>
              </CardContent>
            </>
          )}

          {status === "success" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-green-600">🎉 Welcome!</CardTitle>
                <CardDescription>
                  You&apos;ve successfully joined the class
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Redirecting to the class…
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push("/students/classes")}
                >
                  Go to all classes
                </Button>
              </CardContent>
            </>
          )}

          {status === "error" && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-destructive">
                  Unable to Accept
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-destructive text-sm">{error}</p>
                <div className="flex flex-col gap-3">
                  <Button onClick={handleAcceptInvite} variant="outline">
                    Try Again
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => router.push("/students/classes")}
                  >
                    Go to classes
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




