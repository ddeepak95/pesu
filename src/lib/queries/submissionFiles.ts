import { createClient } from "@/lib/supabase";
import { SubmissionFile } from "@/types/submission";

const SUBMISSION_FILE_COLUMNS =
  "id, submission_id, assignment_id, filename, file_url, file_size, mime_type, storage_path, parsed_content_url, processing_status, created_at, updated_at";

/**
 * Fetch all files for a submission.
 */
export async function getSubmissionFiles(
  submissionId: string,
): Promise<SubmissionFile[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submission_files")
    .select(SUBMISSION_FILE_COLUMNS)
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("Error fetching submission files:", error);
    return [];
  }

  return (data || []) as SubmissionFile[];
}

/**
 * Upload a file for a submission using the signed URL flow:
 * 1. Request a signed upload URL from the server
 * 2. PUT the file directly to GCS
 * 3. Confirm the upload
 *
 * @param onProgress - Called with 0-100 percentage during upload
 */
export async function uploadSubmissionFile(
  submissionId: string,
  assignmentId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<SubmissionFile> {
  // Step 1: Request signed URL
  const requestRes = await fetch("/api/files/request-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId,
      assignmentId,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
    }),
  });

  if (!requestRes.ok) {
    const err = await requestRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to request upload URL");
  }

  const { signedUrl, fileRecord } = await requestRes.json();

  // Step 2: Upload directly to GCS with progress tracking
  await uploadToGCS(signedUrl, file, onProgress);

  // Step 3: Confirm upload
  const confirmRes = await fetch("/api/files/confirm-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: fileRecord.id }),
  });

  if (!confirmRes.ok) {
    const err = await confirmRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to confirm upload");
  }

  const { fileRecord: confirmed } = await confirmRes.json();
  return confirmed as SubmissionFile;
}

/**
 * PUT file bytes directly to GCS via signed URL using XMLHttpRequest for progress.
 */
function uploadToGCS(
  signedUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`GCS upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during file upload"));
    xhr.onabort = () => reject(new Error("File upload was aborted"));

    xhr.send(file);
  });
}

/**
 * Request a short-lived signed download URL for a submission file. This is an
 * action (one-shot side effect on click) rather than a cacheable read, so it
 * is intentionally not exposed via an SWR hook. Renamed from
 * `getFileDownloadUrl` so the no-restricted-imports read-name pattern doesn't
 * flag callers.
 *
 * Pass type="parsed" to get the parsed markdown version.
 */
export async function requestFileDownloadUrl(
  fileId: string,
  type: "original" | "parsed" = "original",
): Promise<string> {
  const query = type === "parsed" ? "?type=parsed" : "";
  const res = await fetch(`/api/files/${fileId}${query}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get download URL");
  }

  const { url } = await res.json();
  return url as string;
}

/**
 * Delete a submission file (removes from GCS and DB).
 */
export async function deleteSubmissionFile(fileId: string): Promise<void> {
  const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete file");
  }
}
