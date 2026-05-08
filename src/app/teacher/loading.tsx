import ConvoedSymbolLoader from "@/components/ConvoedSymbolLoader";

export default function TeacherLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
      className="min-h-[60vh] flex items-center justify-center"
    >
      <ConvoedSymbolLoader />
    </div>
  );
}
