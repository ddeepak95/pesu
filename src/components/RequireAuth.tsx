"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";

interface RequireAuthProps {
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

/**
 * Wrapper component that requires authentication.
 * Shows loading state while checking auth, redirects to login if not authenticated.
 * After login, user will be redirected back to the original page.
 */
export default function RequireAuth({ 
  children, 
  loadingComponent 
}: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useRequireAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return loadingComponent || (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // If not authenticated, show redirecting message (redirect happens in hook)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}

