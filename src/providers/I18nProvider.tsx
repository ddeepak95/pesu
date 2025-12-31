"use client";

import { useEffect } from "react";
import "@/lib/i18n";

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  useEffect(() => {
    // i18n is initialized in the imported file
    // This component ensures i18n is loaded on the client side
  }, []);

  return <>{children}</>;
}
