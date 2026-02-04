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
        <div className="w-full max-w-6xl mx-auto px-4 md:px-6 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
