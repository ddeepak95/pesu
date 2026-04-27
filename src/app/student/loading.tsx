import { Loader2 } from "lucide-react";

export default function StudentLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
      className="min-h-[60vh] flex items-center justify-center"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
