import React from "react";
import Header from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  userName?: string;
}

export default function PageLayout({ children, userName }: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header userName={userName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
