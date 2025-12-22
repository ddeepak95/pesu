"use client";

import { Suspense } from "react";
import LoginForm from "@/components/Auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <LoginForm userType="student" defaultRedirect="/students/classes" />
    </Suspense>
  );
}

