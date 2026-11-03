import React from "react";
import Header from "./Header";

type PageLayoutVariant = "default" | "full-bleed" | "chat";

interface PageLayoutProps {
  children: React.ReactNode;
  variant?: PageLayoutVariant;
  userName?: string;
  onLogoutSubmission?: () => void;
}

export default function PageLayout({
  children,
  variant = "default",
  userName,
  onLogoutSubmission,
}: PageLayoutProps) {
  if (variant === "chat") {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex h-full min-h-[32rem] w-full max-w-5xl flex-col gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
            {children}
          </div>
        </main>
      </div>
    );
  }

  if (variant === "full-bleed") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header userName={userName} onLogoutSubmission={onLogoutSubmission} />
        <main className="flex-1 flex overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header userName={userName} onLogoutSubmission={onLogoutSubmission} />
      <main className="flex-1">
        <div className="w-full max-w-5xl mx-auto p-4 sm:p-8 md:p-14 lg:p-16">
          {children}
        </div>
      </main>
    </div>
  );
}
