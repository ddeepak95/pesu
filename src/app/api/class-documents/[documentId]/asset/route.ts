import { NextRequest, NextResponse } from "next/server";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { documentAccess } from "@/lib/classDocuments/auth";
import { getStorageBucket } from "@/lib/firebase-admin";
import { normalizeFigureLabel } from "@/lib/classDocuments/figureLabels";
import { readDocumentArtifact } from "@/lib/classDocuments/artifacts";
import { runPrefix } from "@/lib/classDocuments/layoutDraft";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const access = await documentAccess(documentId);
  if (!access)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const pageScreenshot = Number(
    request.nextUrl.searchParams.get("pageScreenshot"),
  );
  if (
    Number.isInteger(pageScreenshot) &&
    pageScreenshot > 0 &&
    pageScreenshot <= (access.document.page_count || 0) &&
    access.document.processing_run_id
  ) {
    const bucket = getStorageBucket();
    const screenshot = bucket.file(
      `${runPrefix(documentId, access.document.processing_run_id)}/screenshots/${pageScreenshot}.png`,
    );
    if (!(await screenshot.exists())[0]) {
      const [pdfBytes] = await bucket
        .file(access.document.original_path)
        .download();
      const parser = new PDFParse({ data: new Uint8Array(pdfBytes) });
      let page;
      try {
        page = (
          await parser.getScreenshot({
            partial: [pageScreenshot],
            desiredWidth: 1250,
            imageBuffer: true,
            imageDataUrl: false,
          })
        ).pages.find((item) => item.pageNumber === pageScreenshot);
      } finally {
        await parser.destroy();
      }
      if (!page?.data.length)
        return NextResponse.json(
          { error: "Page screenshot is unavailable" },
          { status: 404 },
        );
      await screenshot.save(Buffer.from(page.data), {
        contentType: "image/png",
        resumable: false,
      });
    }
    const [bytes] = await screenshot.download();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  const figureId = request.nextUrl.searchParams.get("figureId");
  const figureLabel = request.nextUrl.searchParams.get("figureLabel");
  const figureOrder = Number(request.nextUrl.searchParams.get("figureOrder"));
  const lookupByLabel = Boolean(figureLabel && !figureId);
  let path = access.document.original_path as string;
  const artifactPath =
    access.document.draft_path || access.document.approved_path;
  if (request.nextUrl.searchParams.get("type") === "markdown") {
    if (!artifactPath)
      return NextResponse.json(
        { error: "Markdown not available" },
        { status: 404 },
      );
    path = `${artifactPath}/content.md`;
  }
  if (
    figureId ||
    figureLabel ||
    (Number.isInteger(figureOrder) && figureOrder > 0)
  ) {
    const label = figureLabel ? normalizeFigureLabel(figureLabel) : null;
    if (figureLabel && !label)
      return NextResponse.json(
        { error: "Invalid figure label" },
        { status: 400 },
      );
    if (!artifactPath)
      return NextResponse.json(
        { error: "Figure not available" },
        { status: 404 },
      );
    const artifact = await readDocumentArtifact(artifactPath);
    const data = artifact.index.figures.filter((figure) =>
      figureId
        ? figure.id === figureId
        : label
          ? figure.source_labels.includes(label)
          : figure.figure_order === figureOrder,
    );
    if (!data?.length)
      return NextResponse.json({ error: "Figure not found" }, { status: 404 });
    if (lookupByLabel && request.nextUrl.searchParams.get("raw") !== "1") {
      const figures = await Promise.all(
        data.map(async (figure) => {
          const [url] = await getStorageBucket()
            .file(figure.storage_path)
            .getSignedUrl({
              version: "v4",
              action: "read",
              expires: Date.now() + 10 * 60 * 1000,
            });
          return {
            id: figure.id,
            figureOrder: figure.figure_order,
            pageNumber: figure.page_number,
            sourceLabels: figure.source_labels,
            url,
          };
        }),
      );
      return NextResponse.json({
        figures,
        ...(figures.length === 1 ? { url: figures[0].url } : {}),
      });
    }
    if (data.length > 1)
      return NextResponse.json(
        {
          error:
            "This figure has multiple images; retrieve them by figure ID or omit raw=1 to list them",
        },
        { status: 409 },
      );
    path = data[0].storage_path;
  }
  if (request.nextUrl.searchParams.get("raw") === "1") {
    if (!path.includes(`/figures/`))
      return NextResponse.json({ error: "Figure required" }, { status: 400 });
    const [bytes] = await getStorageBucket().file(path).download();
    const type = path.endsWith(".png")
      ? "image/png"
      : path.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  const [url] = await getStorageBucket()
    .file(path)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
    });
  return NextResponse.json({ url });
}
