"use client";
/* eslint-disable @next/next/no-img-element -- Figure images use authenticated class-only routes and cannot use the Next image optimizer. */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { useClassData } from "@/hooks/swr/useClasses";
import {
  useClassDocument,
  useClassDocuments,
  invalidateClassDocuments,
} from "@/hooks/swr/useClassDocuments";

async function action(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

function splitPreviewPages(markdown: string) {
  const parts = markdown.split(/<!-- Page (\d+) -->/g);
  if (parts.length === 1) return [{ number: 1, content: markdown }];
  const pages: { number: number; content: string }[] = [];
  const introduction = parts[0].trim();
  for (let index = 1; index < parts.length; index += 2) {
    const number = Number(parts[index]);
    const content =
      `${index === 1 && introduction ? `${introduction}\n\n` : ""}${parts[index + 1] || ""}`.trim();
    if (Number.isInteger(number) && content) pages.push({ number, content });
  }
  return pages.length ? pages : [{ number: 1, content: markdown }];
}

export default function ClassDocumentsPage() {
  const classId = useParams().classId as string;
  const router = useTrackedRouter();
  const classQuery = useClassData(classId);
  const classDbId = classQuery.data?.id || null;
  const [search, setSearch] = useState("");
  const list = useClassDocuments(classDbId, search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState("preview");
  const [previewPage, setPreviewPage] = useState(1);
  const detail = useClassDocument(selectedId);
  const [seeded, setSeeded] = useState<unknown>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [selectedFigures, setSelectedFigures] = useState<string[]>([]);
  const [figureLabelDrafts, setFigureLabelDrafts] = useState<
    Record<string, string>
  >({});
  const [figureCaptionDrafts, setFigureCaptionDrafts] = useState<
    Record<string, string>
  >({});
  const [figureDescriptionDrafts, setFigureDescriptionDrafts] = useState<
    Record<string, string>
  >({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const document = detail.data?.document;
  const selectedFigureOrders = useMemo(
    () =>
      new Set(
        detail.data?.figures
          .filter((figure) => selectedFigures.includes(figure.id))
          .map((figure) => figure.figure_order) || [],
      ),
    [detail.data?.figures, selectedFigures],
  );
  const previewPages = useMemo(() => splitPreviewPages(markdown), [markdown]);
  const currentPreviewPage =
    previewPages.find((page) => page.number === previewPage) || previewPages[0];
  const currentPreviewIndex = previewPages.indexOf(currentPreviewPage);
  if (detail.data && detail.data !== seeded) {
    setSeeded(detail.data);
    setTitle(detail.data.document.title);
    setTags((detail.data.document.tags || []).join(", "));
    setMarkdown(detail.data.document.markdown || "");
    setSelectedFigures(
      detail.data.figures
        .filter((figure) => figure.selected)
        .map((figure) => figure.id),
    );
    setFigureLabelDrafts(
      Object.fromEntries(
        detail.data.figures.map((figure) => [
          figure.id,
          figure.source_labels.join(", "),
        ]),
      ),
    );
    setFigureCaptionDrafts(
      Object.fromEntries(
        detail.data.figures.map((figure) => [figure.id, figure.caption || ""]),
      ),
    );
    setFigureDescriptionDrafts(
      Object.fromEntries(
        detail.data.figures.map((figure) => [figure.id, figure.description]),
      ),
    );
  }

  async function upload(file: File) {
    if (!classDbId) return;
    setPending(true);
    setError(null);
    try {
      if (
        !file.name.toLowerCase().endsWith(".pdf") ||
        file.size > 20 * 1024 * 1024 ||
        !file.size
      )
        throw new Error("Select a PDF of 20 MB or less");
      const { id, signedUrl } = await action("/api/class-documents", "POST", {
        classId: classDbId,
        filename: file.name,
        fileSize: file.size,
      });
      const response = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!response.ok) throw new Error("PDF upload failed");
      await action(`/api/class-documents/${id}`, "POST", { action: "confirm" });
      setSelectedId(id);
      setView("preview");
      setPreviewPage(1);
      invalidateClassDocuments(classDbId, id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setPending(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await fn();
      if (classDbId)
        invalidateClassDocuments(classDbId, selectedId || undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  async function openAsset(type: "original" | "markdown") {
    if (!selectedId) return;
    const { url } = await action(
      `/api/class-documents/${selectedId}/asset${type === "markdown" ? "?type=markdown" : ""}`,
      "GET",
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function figureLabelsForSave() {
    return Object.fromEntries(
      (detail.data?.figures || []).map((figure) => [
        figure.id,
        (figureLabelDrafts[figure.id] || "")
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
      ]),
    );
  }

  const matches = list.data?.documents || [];
  return (
    <PageLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Button
          variant="link"
          className="p-0"
          onClick={() => router.push(`/teacher/classes/${classId}`)}
        >
          &larr; Class
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Class documents</h1>
          <p className="text-muted-foreground">
            Convert PDFs, review their content, and reuse them in activities.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            aria-label="Search documents"
            placeholder="Search documents"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
          />
          <label className="cursor-pointer rounded border px-4 py-2">
            {pending ? "Working…" : "Upload PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={pending || !classDbId}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            {matches.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setView("preview");
                  setPreviewPage(1);
                }}
                className={`w-full rounded border p-3 text-left ${selectedId === item.id ? "border-primary" : ""}`}
              >
                <strong className="block break-words">{item.title}</strong>
                <span className="text-sm text-muted-foreground">
                  {item.status}
                  {item.page_count ? ` · ${item.page_count} pages` : ""}
                </span>
              </button>
            ))}
            {!matches.length && (
              <p className="text-sm text-muted-foreground">
                No documents found.
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-4 rounded border p-5">
            {!selectedId && <p>Select a document to review it.</p>}
            {selectedId && !document && <p>Preparing document preview...</p>}
            {document && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{document.filename}</strong>
                  <span className="rounded bg-muted px-2 py-1 text-sm">
                    {document.status}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void run(() => openAsset("original"))}
                  >
                    Original PDF
                  </Button>
                  {["review", "ready"].includes(document.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void run(() => openAsset("markdown"))}
                    >
                      Markdown file
                    </Button>
                  )}
                </div>
                {document.error_message && (
                  <p role="alert" className="text-destructive">
                    {document.error_message}
                  </p>
                )}
                {document.status === "processing" && (
                  <p>
                    Converting PDF:{" "}
                    {document.processing_stage === "assembling"
                      ? "preparing the review draft"
                      : "extracting layout with Document AI"}
                    . This page checks for results automatically.
                  </p>
                )}
                {document.status === "failed" && (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      void run(() =>
                        action(`/api/class-documents/${selectedId}`, "POST", {
                          action: "retry",
                        }),
                      )
                    }
                  >
                    Retry conversion
                  </Button>
                )}
                {(["review", "ready"] as string[]).includes(
                  document.status,
                ) && (
                  <>
                    {!!detail.data?.reviewWarnings?.length && (
                      <div
                        role="alert"
                        className="rounded border border-amber-500 p-3 text-sm"
                      >
                        <strong>Review these conversion issues:</strong>
                        <ul className="list-disc pl-5">
                          {detail.data.reviewWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <label className="block space-y-1">
                      <span>Title</span>
                      <Input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span>Search tags</span>
                      <Input
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="Separate tags with commas"
                      />
                    </label>
                    <Tabs
                      value={view}
                      onValueChange={setView}
                      className="space-y-4"
                    >
                      <TabsList>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                        <TabsTrigger value="edit">
                          Edit Markdown and figures
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="preview" className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Preview the converted Markdown with figures in their
                          document positions. Choose Edit to correct the text or
                          remove figures.
                        </p>
                        {previewPages.length > 1 && (
                          <div className="flex flex-wrap items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentPreviewIndex === 0}
                              onClick={() =>
                                setPreviewPage(
                                  previewPages[currentPreviewIndex - 1].number,
                                )
                              }
                            >
                              Previous page
                            </Button>
                            <span className="text-sm">
                              Page {currentPreviewPage.number} of{" "}
                              {previewPages.length}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                currentPreviewIndex === previewPages.length - 1
                              }
                              onClick={() =>
                                setPreviewPage(
                                  previewPages[currentPreviewIndex + 1].number,
                                )
                              }
                            >
                              Next page
                            </Button>
                          </div>
                        )}
                        <div className="prose max-w-none overflow-hidden rounded border p-4 dark:prose-invert">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              img: ({ src, alt }) => {
                                const order = /figures\/(\d+)\./.exec(
                                  typeof src === "string" ? src : "",
                                )?.[1];
                                if (
                                  !order ||
                                  !selectedFigureOrders.has(Number(order))
                                )
                                  return null;
                                const figure = detail.data?.figures.find(
                                  (item) => item.figure_order === Number(order),
                                );
                                return (
                                  <span className="block">
                                    <img
                                      className="h-auto max-w-full rounded"
                                      loading="lazy"
                                      src={`/api/class-documents/${selectedId}/asset?figureOrder=${order}&raw=1`}
                                      alt={alt || "Figure"}
                                    />
                                    {figure && figureLabelDrafts[figure.id] && (
                                      <span className="mt-1 block text-sm font-medium">
                                        {figureLabelDrafts[figure.id]}
                                      </span>
                                    )}
                                  </span>
                                );
                              },
                            }}
                          >
                            {currentPreviewPage.content}
                          </ReactMarkdown>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            Original page {currentPreviewPage.number}
                          </p>
                          <img
                            key={`${selectedId}-${currentPreviewPage.number}`}
                            alt={`Original PDF page ${currentPreviewPage.number}`}
                            loading="lazy"
                            className="h-auto max-w-full rounded border"
                            src={`/api/class-documents/${selectedId}/asset?pageScreenshot=${currentPreviewPage.number}`}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="edit" className="space-y-4">
                        <label className="block space-y-1">
                          <span>Markdown corrections</span>
                          <Textarea
                            value={markdown}
                            onChange={(event) =>
                              setMarkdown(event.target.value)
                            }
                            rows={16}
                          />
                        </label>
                        <div>
                          <h2 className="font-semibold">Figures</h2>
                          <p className="text-sm text-muted-foreground">
                            Verify each image, caption, and A/B panel against
                            the original page. Separate labels with commas.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {detail.data?.figures.map((figure) => (
                              <div
                                key={figure.id}
                                className="space-y-2 rounded border p-3"
                              >
                                <label className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedFigures.includes(
                                      figure.id,
                                    )}
                                    onChange={(event) =>
                                      setSelectedFigures(
                                        event.target.checked
                                          ? [...selectedFigures, figure.id]
                                          : selectedFigures.filter(
                                              (id) => id !== figure.id,
                                            ),
                                      )
                                    }
                                  />
                                  <span>
                                    Page {figure.page_number}:{" "}
                                    {figure.description}
                                  </span>
                                </label>
                                <img
                                  alt={figure.description}
                                  loading="lazy"
                                  className="max-h-40 object-contain"
                                  src={`/api/class-documents/${selectedId}/asset?figureOrder=${figure.figure_order}&raw=1`}
                                />
                                <label className="block space-y-1">
                                  <span>Source figure labels</span>
                                  <Input
                                    aria-label={`Source figure labels for image ${figure.figure_order}`}
                                    placeholder="Figure 50.3, Figure 50.3A"
                                    value={figureLabelDrafts[figure.id] || ""}
                                    onChange={(event) =>
                                      setFigureLabelDrafts({
                                        ...figureLabelDrafts,
                                        [figure.id]: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span>Caption</span>
                                  <Textarea
                                    aria-label={`Caption for image ${figure.figure_order}`}
                                    rows={2}
                                    value={figureCaptionDrafts[figure.id] || ""}
                                    onChange={(event) =>
                                      setFigureCaptionDrafts({
                                        ...figureCaptionDrafts,
                                        [figure.id]: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span>Image description</span>
                                  <Textarea
                                    aria-label={`Description for image ${figure.figure_order}`}
                                    rows={2}
                                    value={
                                      figureDescriptionDrafts[figure.id] || ""
                                    }
                                    onChange={(event) =>
                                      setFigureDescriptionDrafts({
                                        ...figureDescriptionDrafts,
                                        [figure.id]: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  {figure.label_source === "nearby_text"
                                    ? "Suggested from nearby text; verify this match."
                                    : figure.label_source === "annotation"
                                      ? "Detected in the image description."
                                      : figure.label_source === "teacher"
                                        ? "Teacher edited."
                                        : "No label detected."}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          void run(() =>
                            action(
                              `/api/class-documents/${selectedId}`,
                              "PATCH",
                              {
                                title,
                                tags: tags
                                  .split(",")
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                                markdown,
                                selectedFigureIds: selectedFigures,
                                figureLabels: figureLabelsForSave(),
                                figureCaptions: figureCaptionDrafts,
                                figureDescriptions: figureDescriptionDrafts,
                                ready: false,
                              },
                            ),
                          )
                        }
                      >
                        Save corrections
                      </Button>
                      <Button
                        disabled={pending}
                        onClick={() =>
                          void run(() =>
                            action(
                              `/api/class-documents/${selectedId}`,
                              "PATCH",
                              {
                                title,
                                tags: tags
                                  .split(",")
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                                markdown,
                                selectedFigureIds: selectedFigures,
                                figureLabels: figureLabelsForSave(),
                                figureCaptions: figureCaptionDrafts,
                                figureDescriptions: figureDescriptionDrafts,
                                ready: true,
                              },
                            ),
                          )
                        }
                      >
                        Mark ready
                      </Button>
                    </div>
                  </>
                )}
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Delete this document?"))
                      void run(async () => {
                        await action(
                          `/api/class-documents/${selectedId}`,
                          "DELETE",
                        );
                        setSelectedId(null);
                      });
                  }}
                >
                  Delete document
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
