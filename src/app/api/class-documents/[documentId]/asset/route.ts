import { NextRequest, NextResponse } from "next/server";
import { documentAccess } from "@/lib/classDocuments/auth";
import { getStorageBucket } from "@/lib/firebase-admin";
import { normalizeFigureLabel } from "@/lib/classDocuments/figureLabels";
import { readDocumentArtifact } from "@/lib/classDocuments/artifacts";

export async function GET(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const access = await documentAccess(documentId);
  if (!access) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const figureId = request.nextUrl.searchParams.get("figureId");
  const figureLabel = request.nextUrl.searchParams.get("figureLabel");
  const figureOrder = Number(request.nextUrl.searchParams.get("figureOrder"));
  const lookupByLabel = Boolean(figureLabel && !figureId);
  let path = access.document.original_path as string;
  const artifactPath = access.document.draft_path || access.document.approved_path;
  if (request.nextUrl.searchParams.get("type") === "markdown") {
    if (!artifactPath) return NextResponse.json({ error: "Markdown not available" }, { status: 404 });
    path = `${artifactPath}/content.md`;
  }
  if (figureId || figureLabel || Number.isInteger(figureOrder) && figureOrder > 0) {
    const label = figureLabel ? normalizeFigureLabel(figureLabel) : null;
    if (figureLabel && !label) return NextResponse.json({ error: "Invalid figure label" }, { status: 400 });
    if (!artifactPath) return NextResponse.json({ error: "Figure not available" }, { status: 404 });
    const artifact = await readDocumentArtifact(artifactPath);
    const data = artifact.index.figures.filter((figure) => figureId ? figure.id === figureId : label ? figure.source_labels.includes(label) : figure.figure_order === figureOrder);
    if (!data?.length) return NextResponse.json({ error: "Figure not found" }, { status: 404 });
    if (lookupByLabel && request.nextUrl.searchParams.get("raw") !== "1") {
      const figures = await Promise.all(data.map(async (figure) => {
        const [url] = await getStorageBucket().file(figure.storage_path).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000 });
        return { id: figure.id, figureOrder: figure.figure_order, pageNumber: figure.page_number, sourceLabels: figure.source_labels, url };
      }));
      return NextResponse.json({ figures, ...(figures.length === 1 ? { url: figures[0].url } : {}) });
    }
    if (data.length > 1) return NextResponse.json({ error: "This figure has multiple images; retrieve them by figure ID or omit raw=1 to list them" }, { status: 409 });
    path = data[0].storage_path;
  }
  if (request.nextUrl.searchParams.get("raw") === "1") {
    if (!path.includes(`/figures/`)) return NextResponse.json({ error: "Figure required" }, { status: 400 });
    const [bytes] = await getStorageBucket().file(path).download();
    const type = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=300" } });
  }
  const [url] = await getStorageBucket().file(path).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000 });
  return NextResponse.json({ url });
}
