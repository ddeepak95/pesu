import React from "react";

interface InnerPageLayoutProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function InnerPageLayout({
  title,
  action,
  children,
}: InnerPageLayoutProps) {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        {action && <div>{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

