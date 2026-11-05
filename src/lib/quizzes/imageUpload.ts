export async function uploadQuizImage(classId: string, file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
    throw new Error("Choose a PNG, JPEG or WebP up to 10 MB.");
  }
  const endpoint = `/api/classes/${encodeURIComponent(classId)}/quiz-images`;
  async function operation(body: Record<string, unknown>) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Image upload failed. Please try again.");
    return data;
  }
  const requested = await operation({ action: "request", filename: file.name, mime_type: file.type, file_size: file.size });
  const uploaded = await fetch(requested.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploaded.ok) throw new Error("Image upload failed. Please choose the file again to retry.");
  const confirmed = await operation({ action: "confirm", id: requested.id });
  return confirmed.url;
}
