import React from "react";
import Header from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  userName?: string;
  onLogoutSubmission?: () => void;
}

export default function PageLayout({
  children,
  userName,
  onLogoutSubmission,
}: PageLayoutProps) {
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
