/**
 * Backup everything related to one class — every DB row across every
 * class-scoped table plus every GCS object — into a self-contained archive.
 * See dev-docs/class-backup-and-deletion-plan.md §5.
 *
 *   npx tsx scripts/backup-class.ts --class <uuid|textId> [--env prod|local]
 *                                   [--out <dir>] [--no-files] [--confirm]
 *
 * Dry-run by default: without --confirm it prints the plan (id closure sizes,
 * per-table row counts, GCS object counts + bytes) and writes nothing.
 */
import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import {
  BackupManifest,
  buildClosure,
  buildGcsPrefixes,
  collectRowDerivedPaths,
  computeArchiveHash,
  countSpecRows,
  createServiceClient,
  DELETION_ORDER,
  fmtBytes,
  getBucket,
  loadEnvLocal,
  missingTables,
  parseCliArgs,
  argString,
  pooled,
  prodGuard,
  resolveClass,
  resolveTarget,
  selectSpecRows,
  TABLE_SPECS,
  TargetEnv,
  withRetry,
} from "./lib/classClosure";

interface GcsIndexEntry {
  path: string;
  size: number;
  md5: string; // base64, as reported by GCS
  access: "public" | "private";
  downloadedTo: string;
}

async function main() {
  loadEnvLocal();
  const args = parseCliArgs(process.argv.slice(2));
  const classInput = argString(args, "class");
  if (!classInput) {
    console.error(
      "Usage: npx tsx scripts/backup-class.ts --class <uuid|textId> [--env prod|local] [--out <dir>] [--no-files] [--confirm]"
    );
    process.exit(1);
  }
  const env = (argString(args, "env") ?? "prod") as TargetEnv;
  const confirm = args.get("confirm") === true;
  const noFiles = args.get("no-files") === true;

  const target = resolveTarget(env);
  const supabase = createServiceClient(target);
  console.log(`Source DB:     ${target.url}`);
  console.log(`Source bucket: ${target.bucketName}`);

  const cls = await resolveClass(supabase, classInput);
  if (!cls) {
    console.error(`Class not found for input "${classInput}"`);
    process.exit(1);
  }
  console.log(`\nClass: "${cls.name}"  uuid=${cls.id}  text id=${cls.class_id}`);

  console.log("\nBuilding ID closure...");
  const closure = await buildClosure(supabase, cls);
  console.log(
    `  assignments=${closure.assignmentIds.length} quizzes=${closure.quizIds.length} ` +
      `surveys=${closure.surveyIds.length} contentItems=${closure.contentItemIds.length}\n` +
      `  submissions=${closure.submissionIds.length} questions=${closure.submissionQuestionIds.length} ` +
      `attempts=${closure.attemptIds.length} chatMessages=${closure.chatMessageIds.length}\n` +
      `  aiInvocations=${closure.invocationIds.length} wallets=${closure.walletIds.length}`
  );

  // --- plan: per-table counts ---
  console.log("\nCounting rows per table...");
  const tableCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const table of DELETION_ORDER) {
    const n = await countSpecRows(supabase, TABLE_SPECS[table], closure);
    tableCounts[table] = n;
    totalRows += n;
    if (n > 0) console.log(`  ${table.padEnd(32)} ${n}`);
  }
  console.log(`  TOTAL rows: ${totalRows}`);

  // --- plan: GCS object set ---
  const bucket = getBucket();
  const prefixes = buildGcsPrefixes(closure);
  const objects = new Map<string, { size: number; md5: string }>();
  if (!noFiles) {
    console.log(`\nListing GCS objects (${prefixes.length} prefixes + row-derived)...`);
    for (const prefix of prefixes) {
      const [files] = await withRetry(`list ${prefix}`, () =>
        bucket.getFiles({ prefix, autoPaginate: true })
      );
      for (const f of files) {
        objects.set(f.name, {
          size: Number(f.metadata.size ?? 0),
          md5: String(f.metadata.md5Hash ?? ""),
        });
      }
    }
    const rowPaths = await collectRowDerivedPaths(supabase, closure, target.bucketName);
    for (const p of rowPaths) {
      if (objects.has(p)) continue;
      const file = bucket.file(p);
      const [exists] = await withRetry(`stat ${p}`, () => file.exists());
      if (!exists) continue; // row references an object that no longer exists
      const [meta] = await withRetry(`meta ${p}`, () => file.getMetadata());
      objects.set(p, { size: Number(meta.size ?? 0), md5: String(meta.md5Hash ?? "") });
    }
  }
  const totalBytes = [...objects.values()].reduce((a, o) => a + o.size, 0);
  console.log(
    noFiles
      ? "\nGCS: skipped (--no-files)"
      : `\nGCS: ${objects.size} objects, ${fmtBytes(totalBytes)}`
  );

  if (!confirm) {
    console.log("\nDRY RUN — nothing written. Re-run with --confirm to create the archive.");
    return;
  }

  await prodGuard(target, "read-only backup export");

  // --- output dir ---
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15); // YYYYMMDD-HHmmss
  const outRoot = argString(args, "out") ?? join("class-backups", `${cls.class_id}_${stamp}`);
  const outDir = resolve(outRoot);
  await mkdir(join(outDir, "db"), { recursive: true });
  console.log(`\nWriting archive to ${outDir}`);

  // --- DB export: NDJSON per table ---
  const writtenCounts: Record<string, number> = {};
  for (const table of DELETION_ORDER) {
    if (tableCounts[table] === 0) {
      writtenCounts[table] = 0;
      continue;
    }
    const filePath = join(outDir, "db", `${table}.ndjson`);
    const stream = createWriteStream(filePath, { encoding: "utf8" });
    let rows = 0;
    await selectSpecRows(supabase, TABLE_SPECS[table], closure, "*", (row) => {
      stream.write(JSON.stringify(row) + "\n");
      rows++;
    });
    await new Promise<void>((res, rej) => stream.end((e?: Error | null) => (e ? rej(e) : res())));
    writtenCounts[table] = rows;
    console.log(`  db/${table}.ndjson  ${rows} rows`);
    if (rows !== tableCounts[table]) {
      console.warn(
        `  NOTE: ${table} count changed during export (${tableCounts[table]} -> ${rows}); manifest records the exported count.`
      );
    }
  }

  // --- GCS download ---
  const gcsIndex: GcsIndexEntry[] = [];
  if (!noFiles && objects.size > 0) {
    console.log(`\nDownloading ${objects.size} GCS objects...`);
    let done = 0;
    const entries = [...objects.entries()];
    await pooled(entries, 8, async ([path, meta]) => {
      const dest = join(outDir, "gcs", ...path.split("/"));
      await mkdir(dirname(dest), { recursive: true });
      await withRetry(`download ${path}`, () => bucket.file(path).download({ destination: dest }));
      // verify md5 when GCS reported one (composite objects may lack it)
      if (meta.md5) {
        const { readFile } = await import("fs/promises");
        const buf = await readFile(dest);
        const localMd5 = createHash("md5").update(buf).digest("base64");
        if (localMd5 !== meta.md5) {
          throw new Error(`md5 mismatch for ${path}: local ${localMd5} != remote ${meta.md5}`);
        }
      }
      gcsIndex.push({
        path,
        size: meta.size,
        md5: meta.md5,
        // voice recordings are makePublic()'d by the writers; everything else is private
        access: path.startsWith("voice-recordings/") ? "public" : "private",
        downloadedTo: `gcs/${path}`,
      });
      done++;
      if (done % 100 === 0) console.log(`  ...${done}/${objects.size}`);
    });
    gcsIndex.sort((a, b) => (a.path < b.path ? -1 : 1));
  }
  await writeFile(join(outDir, "gcs-index.json"), JSON.stringify(gcsIndex, null, 2), "utf8");

  // --- manifest ---
  const contentHash = await computeArchiveHash(outDir);
  const manifest: BackupManifest = {
    tool: "backup-class",
    version: 1,
    createdAt: new Date().toISOString(),
    source: { env, url: target.url, bucket: target.bucketName },
    classUuid: cls.id,
    classTextId: cls.class_id,
    className: cls.name,
    closure,
    tables: writtenCounts,
    missingTables: [...missingTables].sort(),
    gcs: { objectCount: gcsIndex.length, totalBytes, skipped: noFiles },
    contentHash,
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const restoreMd = `# Class archive: ${cls.name} (${cls.class_id})

Created ${manifest.createdAt} from ${target.url} / bucket ${target.bucketName} by scripts/backup-class.ts.

- \`manifest.json\` — id closure, per-table row counts, GCS object counts, content hash.
- \`db/*.ndjson\` — one JSON row per line, one file per non-empty table.
- \`gcs/…\` — mirrored bucket objects, original paths preserved.
- \`gcs-index.json\` — per-object path/size/md5/access mode.

## Restore

\`\`\`bash
npx tsx scripts/restore-class.ts --backup "${outDir.split("\\").join("/")}" --env ${env} --confirm
\`\`\`

Same-project rollback re-links auth.users / institutions automatically (they are
never part of the archive). See dev-docs/class-backup-and-deletion-plan.md §8.
`;
  await writeFile(join(outDir, "RESTORE.md"), restoreMd, "utf8");

  console.log(`\nBackup complete.`);
  console.log(`  rows:    ${Object.values(writtenCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`  objects: ${gcsIndex.length} (${fmtBytes(totalBytes)})`);
  console.log(`  archive: ${outDir}`);
  console.log(`  hash:    ${contentHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
