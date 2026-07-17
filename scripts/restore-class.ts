/**
 * Restore a class archive produced by backup-class.ts back into a Supabase
 * project + GCS bucket. See dev-docs/class-backup-and-deletion-plan.md §8.
 *
 *   npx tsx scripts/restore-class.ts --backup <dir> [--env prod|local]
 *        [--confirm] [--skip-files] [--on-conflict skip|overwrite|abort] [--force]
 *
 * Dry-run by default: without --confirm it prints exactly what would be
 * inserted/uploaded and changes nothing.
 *
 * v1 restores with ORIGINAL ids only (same-project rollback). Cross-project
 * restore needs auth.users / institutions handled out of band (plan §8.6).
 */
import { createHash } from "crypto";
import { createReadStream, existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { createInterface } from "readline";
import {
  BackupManifest,
  computeArchiveHash,
  countSpecRows,
  createServiceClient,
  fmtBytes,
  getBucket,
  loadEnvLocal,
  parseCliArgs,
  argString,
  pooled,
  prodGuard,
  resolveTarget,
  RESTORE_ORDER,
  TABLE_SPECS,
  TargetEnv,
  withRetry,
} from "./lib/classClosure";

type OnConflict = "abort" | "skip" | "overwrite";

const BATCH = 500;

/** Columns whose values reference auth.users (checked in preflight, never restored). */
const USER_COLUMN_RE =
  /^(user_id|student_id|teacher_id|created_by|updated_by|added_by|moved_by|unlocked_by|changed_by|reviewed_by)$/;

/**
 * Columns pointing "forward" in RESTORE_ORDER: inserted as NULL in the first
 * pass, patched once the referenced rows exist.
 */
const DEFERRED_COLUMNS: Record<string, { column: string; patchAfterTable: string }> = {
  submission_questions: { column: "selected_attempt_id", patchAfterTable: "submission_attempts" },
  ai_invocations: { column: "retry_of", patchAfterTable: "ai_invocations" }, // self-FK
};

async function* ndjsonRows(path: string): AsyncGenerator<Record<string, unknown>> {
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) yield JSON.parse(trimmed) as Record<string, unknown>;
  }
}

async function main() {
  loadEnvLocal();
  const args = parseCliArgs(process.argv.slice(2));
  const backupDirArg = argString(args, "backup");
  if (!backupDirArg) {
    console.error(
      "Usage: npx tsx scripts/restore-class.ts --backup <dir> [--env prod|local] [--confirm] [--skip-files] [--on-conflict skip|overwrite|abort] [--force]"
    );
    process.exit(1);
  }
  const env = (argString(args, "env") ?? "prod") as TargetEnv;
  const confirm = args.get("confirm") === true;
  const skipFiles = args.get("skip-files") === true;
  const force = args.get("force") === true;
  const onConflict = (argString(args, "on-conflict") ?? "abort") as OnConflict;
  if (!["abort", "skip", "overwrite"].includes(onConflict)) {
    console.error(`Invalid --on-conflict "${onConflict}" (use skip|overwrite|abort)`);
    process.exit(1);
  }

  const target = resolveTarget(env);
  const supabase = createServiceClient(target);
  console.log(`Target DB:     ${target.url}`);
  console.log(`Target bucket: ${target.bucketName}`);

  // --- preconditions ---
  const backupDir = resolve(backupDirArg);
  const manifestPath = join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Backup manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;
  console.log(`\nArchive: "${manifest.className}" (${manifest.classTextId})`);
  console.log(`Created ${manifest.createdAt} from ${manifest.source.url}`);

  process.stdout.write("Verifying archive integrity hash... ");
  const hash = await computeArchiveHash(backupDir);
  if (hash !== manifest.contentHash) {
    if (!force) {
      console.error(`MISMATCH\n  manifest: ${manifest.contentHash}\n  computed: ${hash}\nAborting (--force to override).`);
      process.exit(1);
    }
    console.warn("MISMATCH — continuing due to --force");
  } else {
    console.log("ok");
  }

  // absence check
  const { data: existing, error: exErr } = await supabase
    .from("classes")
    .select("id, class_id")
    .or(`id.eq.${manifest.classUuid},class_id.eq.${manifest.classTextId}`);
  if (exErr) throw new Error(`absence check failed: ${exErr.message}`);
  if ((existing?.length ?? 0) > 0 && onConflict === "abort") {
    console.error(
      `\nClass already exists in the target (${existing!.map((r) => r.class_id).join(", ")}).\n` +
        `Restoring over a live class risks partial merges. Use --on-conflict skip (resume) or overwrite (rollback of a botched delete).`
    );
    process.exit(1);
  }

  // external refs: institution + auth.users must already exist in the target
  console.log("\nChecking external references (institutions, auth.users)...");
  const missingRefs: string[] = [];
  if (manifest.closure.institutionId) {
    const { data: inst } = await supabase
      .from("institutions")
      .select("id")
      .eq("id", manifest.closure.institutionId)
      .maybeSingle();
    if (!inst) missingRefs.push(`institution ${manifest.closure.institutionId}`);
  }
  const userIds = new Set<string>();
  for (const table of RESTORE_ORDER) {
    const file = join(backupDir, "db", `${table}.ndjson`);
    if (!existsSync(file)) continue;
    for await (const row of ndjsonRows(file)) {
      for (const [col, val] of Object.entries(row)) {
        if (typeof val === "string" && USER_COLUMN_RE.test(col) && /^[0-9a-f-]{36}$/i.test(val)) {
          userIds.add(val);
        }
      }
    }
  }
  const missingUsers: string[] = [];
  await pooled([...userIds], 8, async (uid) => {
    const { data, error } = await supabase.auth.admin.getUserById(uid);
    if (error || !data?.user) missingUsers.push(uid);
  });
  if (missingUsers.length > 0) missingRefs.push(`${missingUsers.length} auth.users id(s): ${missingUsers.slice(0, 5).join(", ")}${missingUsers.length > 5 ? ", …" : ""}`);
  if (missingRefs.length > 0) {
    console.warn("Missing external references in the target:");
    for (const m of missingRefs) console.warn(`  - ${m}`);
    if (!force) {
      console.error(
        "\nSame-project rollback should never hit this; a cross-project restore needs these handled first (plan §8.6). Aborting (--force to try anyway)."
      );
      process.exit(1);
    }
    console.warn("--force: proceeding; rows referencing missing users/institutions may fail to insert.");
  } else {
    console.log(`  ok (${userIds.size} distinct user id(s) present)`);
  }

  // --- plan ---
  const gcsIndex = JSON.parse(await readFile(join(backupDir, "gcs-index.json"), "utf8")) as Array<{
    path: string;
    size: number;
    md5: string;
    access: "public" | "private";
  }>;
  console.log("\nRestore plan (root -> leaf):");
  let totalRows = 0;
  for (const table of RESTORE_ORDER) {
    const n = manifest.tables[table] ?? 0;
    totalRows += n;
    if (n > 0) console.log(`  ${table.padEnd(32)} ${n}`);
  }
  const totalBytes = gcsIndex.reduce((a, o) => a + o.size, 0);
  console.log(`  TOTAL rows: ${totalRows}`);
  console.log(
    skipFiles ? "  GCS: skipped (--skip-files)" : `  GCS: ${gcsIndex.length} objects, ${fmtBytes(totalBytes)}`
  );
  console.log(`  conflict mode: ${onConflict}`);

  if (!confirm) {
    console.log("\nDRY RUN — nothing restored. Re-run with --confirm to restore.");
    return;
  }

  await prodGuard(target, `restore class ${manifest.classTextId} from archive`);

  // --- DB restore, root -> leaf ---
  const insertedCounts: Record<string, number> = {};
  const patches: Record<string, Array<{ pkValue: string; value: unknown }>> = {};

  for (const table of RESTORE_ORDER) {
    const spec = TABLE_SPECS[table];
    const file = join(backupDir, "db", `${table}.ndjson`);
    if (!existsSync(file)) {
      insertedCounts[table] = 0;
      continue;
    }
    const deferred = DEFERRED_COLUMNS[table];
    let batch: Record<string, unknown>[] = [];
    let inserted = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const { error } = await supabase.from(table).upsert(batch, {
        onConflict: spec.pk.join(","),
        ignoreDuplicates: onConflict !== "overwrite",
      });
      if (error) {
        if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
          throw new Error(
            `upsert ${table} failed: table does not exist in the target schema, but the archive ` +
              `contains rows for it. Deploy the migration that creates ${table} before restoring.`
          );
        }
        throw new Error(`upsert ${table} failed: ${error.message}`);
      }
      inserted += batch.length;
      batch = [];
    };

    for await (const row of ndjsonRows(file)) {
      let toInsert = row;
      if (deferred && row[deferred.column] != null) {
        (patches[table] ??= []).push({
          pkValue: String(row[spec.pk[0]]),
          value: row[deferred.column],
        });
        toInsert = { ...row, [deferred.column]: null };
      }
      batch.push(toInsert);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    insertedCounts[table] = inserted;
    if (inserted > 0) console.log(`  restored ${String(inserted).padStart(7)}  ${table}`);

    // patch passes that become possible once this table exists
    for (const [patchTable, def] of Object.entries(DEFERRED_COLUMNS)) {
      if (def.patchAfterTable !== table) continue;
      const pending = patches[patchTable] ?? [];
      if (pending.length === 0) continue;
      const patchPk = TABLE_SPECS[patchTable].pk[0];
      console.log(`  patching ${pending.length} ${patchTable}.${def.column} value(s)...`);
      // one update per row: each row gets its own value (batching would need a CASE)
      await pooled(pending, 8, async (p) => {
        const { error } = await supabase
          .from(patchTable)
          .update({ [def.column]: p.value })
          .eq(patchPk, p.pkValue);
        if (error) throw new Error(`patch ${patchTable}.${def.column} failed: ${error.message}`);
      });
      patches[patchTable] = [];
    }
  }

  // --- GCS restore ---
  let uploaded = 0;
  if (!skipFiles && gcsIndex.length > 0) {
    const bucket = getBucket();
    console.log(`\nUploading ${gcsIndex.length} GCS objects...`);
    await pooled(gcsIndex, 8, async (entry) => {
      const local = join(backupDir, "gcs", ...entry.path.split("/"));
      if (!existsSync(local)) throw new Error(`archive object missing on disk: ${local}`);
      await withRetry(`upload ${entry.path}`, () =>
        bucket.upload(local, { destination: entry.path, resumable: false })
      );
      if (entry.md5) {
        const buf = await readFile(local);
        const localMd5 = createHash("md5").update(buf).digest("base64");
        if (localMd5 !== entry.md5) {
          throw new Error(`md5 mismatch for ${entry.path}: local ${localMd5} != index ${entry.md5}`);
        }
      }
      if (entry.access === "public") {
        await withRetry(`makePublic ${entry.path}`, () => bucket.file(entry.path).makePublic());
      }
      uploaded++;
      if (uploaded % 100 === 0) console.log(`  ...${uploaded}/${gcsIndex.length}`);
    });
  }

  // --- verification pass (mandatory): counts must EQUAL the manifest ---
  console.log("\nVerifying against manifest...");
  const divergences: string[] = [];
  for (const table of RESTORE_ORDER) {
    const expected = manifest.tables[table] ?? 0;
    if (expected === 0) continue;
    const actual = await countSpecRows(supabase, TABLE_SPECS[table], manifest.closure);
    if (actual !== expected) {
      divergences.push(`${table}: expected ${expected}, found ${actual}`);
      console.error(`  MISMATCH ${table}: expected ${expected}, found ${actual}`);
    }
  }
  let objectDivergence = 0;
  if (!skipFiles) {
    const bucket = getBucket();
    // spot-check up to 50 archive objects exist at their original paths
    const sample = gcsIndex.filter((_, i) => i % Math.max(1, Math.floor(gcsIndex.length / 50)) === 0);
    for (const entry of sample) {
      const [exists] = await withRetry(`verify ${entry.path}`, () => bucket.file(entry.path).exists());
      if (!exists) {
        objectDivergence++;
        console.error(`  MISSING object: ${entry.path}`);
      }
    }
  }

  const report = {
    tool: "restore-class",
    completedAt: new Date().toISOString(),
    target: { env, url: target.url, bucket: target.bucketName },
    classUuid: manifest.classUuid,
    classTextId: manifest.classTextId,
    backupDir,
    onConflict,
    insertedPerTable: insertedCounts,
    uploadedObjects: uploaded,
    missingExternalRefs: missingRefs,
    verification: { divergences, objectDivergence, ok: divergences.length === 0 && objectDivergence === 0 },
  };
  await writeFile(join(backupDir, "restore-report.json"), JSON.stringify(report, null, 2), "utf8");

  if (divergences.length > 0 || objectDivergence > 0) {
    console.error(
      `\nVERIFICATION FAILED: ${divergences.length} table divergence(s), ${objectDivergence} missing object(s). See restore-report.json.`
    );
    process.exit(1);
  }
  console.log(`\nRestore complete & verified. ${totalRows} rows, ${uploaded} objects.`);
  console.log(`Report: ${join(backupDir, "restore-report.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
