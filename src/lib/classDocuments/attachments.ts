export async function saveAssignmentDocuments(assignmentId: string, documentIds: string[]) {
  const response = await fetch("/api/assignment-documents", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignmentId, documentIds }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Could not save activity documents");
  }
}
