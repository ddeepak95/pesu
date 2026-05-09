"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";

interface UseConsumeStudentIdDeepLinkOptions {
  /** Gate until submissions/responses list data is ready to resolve a row. */
  ready: boolean;
  /** Locate row and open the existing view dialog (same as table View action). */
  openForStudent: (studentId: string) => void;
}

/**
 * Reads `studentId` from the URL once, opens the submission viewer, then strips
 * the param so refresh does not reopen the dialog.
 */
export function useConsumeStudentIdDeepLink({
  ready,
  openForStudent,
}: UseConsumeStudentIdDeepLinkOptions) {
  const router = useTrackedRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const processedForSidRef = useRef<string | null>(null);

  useEffect(() => {
    const sid = searchParams.get("studentId");
    if (!sid) {
      processedForSidRef.current = null;
      return;
    }
    if (!ready) return;
    if (processedForSidRef.current === sid) return;
    processedForSidRef.current = sid;

    openForStudent(sid);

    const q = new URLSearchParams(searchParams.toString());
    q.delete("studentId");
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    openForStudent,
    pathname,
    ready,
    router,
    searchParams,
  ]);
}
