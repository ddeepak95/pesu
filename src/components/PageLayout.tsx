import React from "react";
import Header from "./Header";

type PageLayoutVariant = "default" | "full-bleed";

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
