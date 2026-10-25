/**
 * Backfill existing class documents into immutable GCS artifacts.
 * Run locally first: npx tsx scripts/migrate-class-documents-to-gcs.ts --local
 * Production requires an explicit --production flag after local verification.
 * Re-running is safe: documents with an artifact pointer are verified and skipped.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";
import { buildDocumentIndex, type DocumentFigure } from "../src/lib/classDocuments/index";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index < 0 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^(?:"(.*)"|'(.*)')$/, (_match, double, single) => double ?? single);
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const local = process.argv.includes("--local");
  const production = process.argv.includes("--production");
  if (local === production) throw new Error("Choose exactly one of --local or --production");
  const url = process.env[local ? "NEXT_PUBLIC_SUPABASE_LOCAL_URL" : "NEXT_PUBLIC_SUPABASE_PROD_URL"];
  const key = process.env[local ? "SUPABASE_LOCAL_SERVICE_ROLE_KEY" : "SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase URL or service key is missing");
  const account = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "", "base64").toString("utf8"));
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(account), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
  const bucket = admin.storage().bucket();
  const db = createClient(url, key, { auth: { persistSession: false } });
  let migrated = 0;
  let scanned = 0;
  let alreadyVersioned = 0;
  for (let offset = 0;; offset += 100) {
    const { data: documents, error } = await db.from("class_documents")
      .select("id, markdown, markdown_path, status, draft_path, approved_path")
      .order("created_at").range(offset, offset + 99);
    if (error) throw error;
    if (!documents?.length) break;
    for (const document of documents) {
      scanned++;
      if (!["review", "ready"].includes(document.status)) continue;
      if (document.draft_path || document.approved_path) {
        const prefix = document.draft_path || document.approved_path;
        const [[content], [indexBytes]] = await Promise.all([
          bucket.file(`${prefix}/content.md`).download(), bucket.file(`${prefix}/index.json`).download(),
        ]);
        const stored = JSON.parse(indexBytes.toString("utf8"));
        if (!content.length || stored.schemaVersion !== 1 || !Array.isArray(stored.figures) || !Array.isArray(stored.chunks)) throw new Error(`Invalid GCS artifact for document ${document.id}`);
        await Promise.all(stored.figures.map(async (figure: DocumentFigure) => {
          const [exists] = await bucket.file(figure.storage_path).exists();
          if (!exists) throw new Error(`Missing figure ${figure.id} for document ${document.id}`);
        }));
        alreadyVersioned++;
        continue;
      }
      if (!document.markdown?.trim()) throw new Error(`Legacy document ${document.id} has no Markdown to migrate`);
      const { data: rows, error: figureError } = await db.from("class_document_figures")
        .select("id, page_number, figure_order, storage_path, description, selected, source_labels, label_source")
        .eq("document_id", document.id).order("figure_order");
      if (figureError) throw figureError;
      const figures = (rows || []) as DocumentFigure[];
      if (document.markdown_path) {
        const [oldFile] = await bucket.file(document.markdown_path).download();
        if (oldFile.toString("utf8") !== document.markdown) throw new Error(`Legacy Markdown differs for document ${document.id}`);
      }
      await Promise.all(figures.map(async (figure) => {
        const [exists] = await bucket.file(figure.storage_path).exists();
        if (!exists) throw new Error(`Missing figure ${figure.id} for document ${document.id}`);
      }));
      const prefix = `class-documents/${document.id}/versions/${randomUUID()}-${document.status === "ready" ? "approved" : "draft"}`;
      const index = buildDocumentIndex(document.markdown, figures);
      await bucket.file(`${prefix}/content.md`).save(document.markdown, { contentType: "text/markdown; charset=utf-8", resumable: false });
      await bucket.file(`${prefix}/index.json`).save(JSON.stringify(index), { contentType: "application/json", resumable: false });
      const [[verifiedContent], [verifiedIndex]] = await Promise.all([
        bucket.file(`${prefix}/content.md`).download(), bucket.file(`${prefix}/index.json`).download(),
      ]);
      if (verifiedContent.toString("utf8") !== document.markdown || JSON.parse(verifiedIndex.toString("utf8")).figures.length !== figures.length) {
        throw new Error(`GCS verification failed for document ${document.id}`);
      }
      const { error: updateError } = await db.from("class_documents").update({
        draft_path: prefix,
        ...(document.status === "ready" ? { approved_path: prefix } : {}),
      }).eq("id", document.id).is("draft_path", null);
      if (updateError) throw updateError;
      migrated++;
      process.stdout.write(`Verified ${document.id}: ${index.chunks.length} chunks, ${figures.length} figures\n`);
    }
    if (documents.length < 100) break;
  }
  process.stdout.write(`Completed ${local ? "local" : "production"} backfill: ${scanned} scanned, ${migrated} migrated, ${alreadyVersioned} already versioned\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
