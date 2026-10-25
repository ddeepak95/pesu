import "server-only";

import { randomUUID } from "node:crypto";
import { getStorageBucket } from "@/lib/firebase-admin";
import type { DocumentIndex } from "./index";
export { buildDocumentIndex } from "./index";
export type { DocumentFigure, DocumentChunk, DocumentIndex } from "./index";

export type DocumentArtifact = { markdown: string; index: DocumentIndex };

export async function writeDocumentArtifact(documentId: string, artifact: DocumentArtifact, stage: "draft" | "approved"): Promise<string> {
  const prefix = `class-documents/${documentId}/versions/${randomUUID()}-${stage}`;
  const bucket = getStorageBucket();
  await bucket.file(`${prefix}/content.md`).save(artifact.markdown, { contentType: "text/markdown; charset=utf-8", resumable: false });
  await bucket.file(`${prefix}/index.json`).save(JSON.stringify(artifact.index), { contentType: "application/json", resumable: false });
  return prefix;
}

export async function readDocumentArtifact(prefix: string): Promise<DocumentArtifact> {
  if (!/^class-documents\/[0-9a-f-]{36}\/versions\/[0-9a-f-]+-(?:draft|approved)$/.test(prefix)) {
    throw new Error("Invalid document version path");
  }
  const bucket = getStorageBucket();
  const [[markdown], [indexBytes]] = await Promise.all([
    bucket.file(`${prefix}/content.md`).download(),
    bucket.file(`${prefix}/index.json`).download(),
  ]);
  const index = JSON.parse(indexBytes.toString("utf8")) as DocumentIndex;
  if (index.schemaVersion !== 1 || !Array.isArray(index.chunks) || !Array.isArray(index.figures)) throw new Error("Invalid document index");
  return { markdown: markdown.toString("utf8"), index };
}
