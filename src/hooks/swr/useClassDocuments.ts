import useSWR, { mutate } from "swr";

export type ClassDocument = {
  id: string;
  class_id: string;
  title: string;
  filename: string;
  tags?: string[];
  file_size: number;
  page_count: number | null;
  status: "uploading" | "processing" | "review" | "ready" | "failed";
  processing_stage?: "document_ai" | "assembling" | null;
  processed_pages?: number;
  error_message: string | null;
  markdown?: string;
  created_at: string;
};
export type ClassDocumentFigure = {
  id: string;
  page_number: number;
  figure_order: number;
  description: string;
  caption?: string;
  caption_source?: "teacher";
  group_label?: string;
  panel_label?: string;
  selected: boolean;
  source_labels: string[];
  label_source: "unlabeled" | "annotation" | "nearby_text" | "teacher";
};

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load documents");
  return body as T;
}

export function useClassDocuments(classId: string | null, search = "") {
  const key = classId
    ? `/api/class-documents?classId=${encodeURIComponent(classId)}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`
    : null;
  return useSWR<{ documents: ClassDocument[] }>(key, readJson, {
    refreshInterval: (data) =>
      data?.documents.some((document) => document.status === "processing")
        ? 5000
        : 0,
  });
}

export function useClassDocument(documentId: string | null) {
  const key = documentId ? `/api/class-documents/${documentId}` : null;
  return useSWR<{
    document: ClassDocument;
    figures: ClassDocumentFigure[];
    reviewWarnings: string[];
  }>(key, readJson, {
    refreshInterval: (data) =>
      data?.document.status === "processing" ? 5000 : 0,
  });
}

export function useAssignmentDocumentIds(assignmentId: string | null) {
  return useSWR<{ documentIds: string[] }>(
    assignmentId
      ? `/api/assignment-documents?assignmentId=${assignmentId}`
      : null,
    readJson,
  );
}

export function invalidateClassDocuments(classId: string, documentId?: string) {
  void mutate(
    (key) =>
      typeof key === "string" &&
      key.startsWith(
        `/api/class-documents?classId=${encodeURIComponent(classId)}`,
      ),
  );
  if (documentId) void mutate(`/api/class-documents/${documentId}`);
}
