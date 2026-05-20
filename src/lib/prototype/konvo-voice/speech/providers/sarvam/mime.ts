/** Sarvam REST STT rejects MIME types with parameters (e.g. `audio/webm;codecs=opus`). */
export function normalizeSarvamRestUpload(
  mimeType?: string,
  filename?: string,
): { mimeType: string; filename: string } {
  const raw = (mimeType ?? "").trim().toLowerCase();
  const base = raw.split(";")[0]?.trim() || "audio/webm";

  let mimeTypeOut = base;
  if (base === "video/webm") {
    mimeTypeOut = "audio/webm";
  }

  let filenameOut = filename?.trim() || "recording.webm";
  if (mimeTypeOut === "audio/webm" && !filenameOut.endsWith(".webm")) {
    filenameOut = "recording.webm";
  } else if (mimeTypeOut === "audio/ogg" && !filenameOut.endsWith(".ogg")) {
    filenameOut = "recording.ogg";
  } else if (
    (mimeTypeOut === "audio/mp4" || mimeTypeOut === "audio/x-m4a") &&
    !filenameOut.endsWith(".mp4") &&
    !filenameOut.endsWith(".m4a")
  ) {
    filenameOut = "recording.mp4";
  } else if (mimeTypeOut === "audio/wav" && !filenameOut.endsWith(".wav")) {
    filenameOut = "recording.wav";
  }

  return { mimeType: mimeTypeOut, filename: filenameOut };
}
