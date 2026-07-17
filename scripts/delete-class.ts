/**
 * Permanently delete everything related to one class — every DB row across
 * every class-scoped table plus every GCS object — gated behind a verified
 * backup. See dev-docs/class-backup-and-deletion-plan.md §6.
 *
 *   npx tsx scripts/delete-class.ts --class <uuid|textId> --backup <dir>
 *        [--env prod|local] [--confirm] [--yes-delete <classTextId>]
 *        [--skip-files] [--force]
 *
 * Dry-run by default: without --confirm it verifies the backup, prints the
 * deletion plan and changes nothing. Actual deletion additionally requires
 * --yes-delete <classTextId> (typing the class id back).
 *
 * --force may bypass the "class changed since backup" drift diff, but NEVER
 * the "backup exists + integrity hash" check (plan §9.5).
 */
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import {
  BackupManifest,
  buildClosure,
  buildGcsPrefixes,
  ClassClosure,
  collectRowDerivedPaths,
  computeArchiveHash,
  countSpecRows,
  createServiceClient,
  DELETION_ORDER,
  deleteSpecRows,
  driftCheck,
  fmtBytes,
  getBucket,
  loadEnvLocal,
  parseCliArgs,
  argString,
  pooled,
  prodGuard,
  resolveClass,
  resolveTarget,
  TABLE_SPECS,
  TargetEnv,
  withRetry,
} from "./lib/classClosure";

function unionClosure(a: ClassClosure, b: ClassClosure): ClassClosure {
  const u = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    classUuid: a.classUuid,
    classTextId: a.classTextId,
    institutionId: a.institutionId ?? b.institutionId,
    assignmentIds: u(a.assignmentIds, b.assignmentIds),
    quizIds: u(a.quizIds, b.quizIds),
    surveyIds: u(a.surveyIds, b.surveyIds),
    contentItemIds: u(a.contentItemIds, b.contentItemIds),
    submissionIds: u(a.submissionIds, b.submissionIds),
    submissionQuestionIds: u(a.submissionQuestionIds, b.submissionQuestionIds),
    attemptIds: u(a.attemptIds, b.attemptIds),
    chatMessageIds: u(a.chatMessageIds, b.chatMessageIds),
    invocationIds: u(a.invocationIds, b.invocationIds),
    walletIds: u(a.walletIds, b.walletIds),
  };
}

function closureDiff(live: ClassClosure, backedUp: ClassClosure): string[] {
  const sets: Array<[string, string[], string[]]> = [
    ["assignmentIds", live.assignmentIds, backedUp.assignmentIds],
    ["quizIds", live.quizIds, backedUp.quizIds],
    ["surveyIds", live.surveyIds, backedUp.surveyIds],
    ["contentItemIds", live.contentItemIds, backedUp.contentItemIds],
    ["submissionIds", live.submissionIds, backedUp.submissionIds],
    ["submissionQuestionIds", live.submissionQuestionIds, backedUp.submissionQuestionIds],
    ["attemptIds", live.attemptIds, backedUp.attemptIds],
    ["chatMessageIds", live.chatMessageIds, backedUp.chatMessageIds],
    ["invocationIds", live.invocationIds, backedUp.invocationIds],
    ["walletIds", live.walletIds, backedUp.walletIds],
  ];
  const problems: string[] = [];
  for (const [name, liveIds, backedIds] of sets) {
    const backed = new Set(backedIds);
    const added = liveIds.filter((id) => !backed.has(id));
    if (added.length > 0) problems.push(`${name}: ${added.length} id(s) exist that are NOT in the backup`);
  }
  return problems;
}

async function main() {
  loadEnvLocal();
  const args = parseCliArgs(process.argv.slice(2));
  const classInput = argString(args, "class");
  const backupDirArg = argString(args, "backup");
  if (!classInput || !backupDirArg) {
    console.error(
      "Usage: npx tsx scripts/delete-class.ts --class <uuid|textId> --backup <dir> [--env prod|local] [--confirm] [--yes-delete <classTextId>] [--skip-files] [--force]"
    );
    process.exit(1);
  }
  const env = (argString(args, "env") ?? "prod") as TargetEnv;
  const confirm = args.get("confirm") === true;
  const skipFiles = args.get("skip-files") === true;
  const force = args.get("force") === true;
  const yesDelete = argString(args, "yes-delete");

  const target = resolveTarget(env);
  const supabase = createServiceClient(target);
  console.log(`Target DB:     ${target.url}`);
  console.log(`Target bucket: ${target.bucketName}`);

  // --- precondition 1: backup manifest ---
  const backupDir = resolve(backupDirArg);
  const manifestPath = join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Backup manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;

  let cls = await resolveClass(supabase, classInput);
  if (!cls) {
    // The classes row may already be deleted from a previous (partially
    // failed) run while leftover child rows/objects remain — resume from the
    // manifest identity so the sweep can still complete.
    if (classInput !== manifest.classUuid && classInput !== manifest.classTextId) {
      console.error(
        `Class not found for input "${classInput}" and it does not match the backup manifest — nothing to delete.`
      );
      process.exit(1);
    }
    cls = {
      id: manifest.classUuid,
      class_id: manifest.classTextId,
      name: manifest.className,
      institution_id: manifest.closure.institutionId,
    };
    console.warn(
      `Live classes row not found — resuming from the manifest to sweep any orphaned rows/objects.`
    );
  }
  if (manifest.classUuid !== cls.id) {
    console.error(
      `Backup is for a DIFFERENT class (manifest ${manifest.classUuid} != resolved ${cls.id}). Aborting.`
    );
    process.exit(1);
  }
  console.log(`\nClass: "${cls.name}"  uuid=${cls.id}  text id=${cls.class_id}`);
  console.log(`Backup: ${backupDir} (created ${manifest.createdAt})`);

  // --- precondition 2: backup integrity (NEVER bypassed by --force) ---
  process.stdout.write("Verifying backup integrity hash... ");
  const hash = await computeArchiveHash(backupDir);
  if (hash !== manifest.contentHash) {
    console.error(`MISMATCH\n  manifest: ${manifest.contentHash}\n  computed: ${hash}\nBackup is corrupt or was modified. Aborting (this check cannot be forced).`);
    process.exit(1);
  }
  console.log("ok");

  // --- precondition 3: drift vs live closure ---
  console.log("Building live ID closure...");
  const liveClosure = await buildClosure(supabase, cls);
  const drift = closureDiff(liveClosure, manifest.closure);
  if (drift.length > 0) {
    console.warn("\nClass changed since the backup:");
    for (const d of drift) console.warn(`  - ${d}`);
    if (!force) {
      console.error("\nRe-run backup-class.ts first (or pass --force to accept losing the new rows). Aborting.");
      process.exit(1);
    }
    console.warn("--force: proceeding; rows created after the backup will be deleted WITHOUT backup.");
  }

  // --- precondition 4: schema drift guard ---
  process.stdout.write("Schema drift guard (OpenAPI)... ");
  const offenders = await driftCheck(target);
  if (offenders.length > 0) {
    console.error(`FAILED\nUnknown class-scoped tables — add them to TABLE_SPECS + the plan first:`);
    for (const o of offenders) console.error(`  - ${o}`);
    process.exit(1);
  }
  console.log("ok");

  // deletion filters = union of backup-time and live closure, so post-backup
  // stragglers (accepted via --force) are still removed
  const closure = unionClosure(liveClosure, manifest.closure);

  // --- the GCS file set must be collected BEFORE rows are deleted ---
  const bucket = getBucket();
  const prefixes = buildGcsPrefixes(closure);
  let explicitPaths: string[] = [];
  if (!skipFiles) {
    if (manifest.gcs.skipped && !force) {
      console.error(
        "\nBackup was made with --no-files: deleting GCS objects would destroy data with no backup. Pass --skip-files to delete DB only, or --force to delete files anyway."
      );
      process.exit(1);
    }
    explicitPaths = await collectRowDerivedPaths(supabase, closure, target.bucketName);
  }

  // --- plan ---
  console.log("\nDeletion plan (leaf -> root):");
  const planCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const table of DELETION_ORDER) {
    const n = await countSpecRows(supabase, TABLE_SPECS[table], closure);
    planCounts[table] = n;
    totalRows += n;
    if (n > 0) console.log(`  ${table.padEnd(32)} ${n}`);
  }
  console.log(`  TOTAL rows: ${totalRows}`);
  console.log(
    skipFiles
      ? "  GCS: skipped (--skip-files)"
      : `  GCS: ${prefixes.length} prefixes + ${explicitPaths.length} row-derived object paths`
  );

  if (!confirm) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --confirm --yes-delete <classTextId> to delete.");
    return;
  }
  if (yesDelete !== cls.class_id) {
    console.error(
      `\n--yes-delete must equal the class text id ("${cls.class_id}") to proceed. Got: ${yesDelete ?? "(missing)"}`
    );
    process.exit(1);
  }

  await prodGuard(target, `PERMANENTLY DELETE class ${cls.class_id}`);

  // --- delete DB rows, leaf -> root ---
  const deletedCounts: Record<string, number> = {};
  for (const table of DELETION_ORDER) {
    try {
      const n = await deleteSpecRows(supabase, TABLE_SPECS[table], closure);
      deletedCounts[table] = n;
      if (n > 0) console.log(`  deleted ${String(n).padStart(7)}  ${table}`);
    } catch (e) {
      console.error(`\nFAILED at table ${table}: ${(e as Error).message}`);
      console.error("Deleted so far:", deletedCounts);
      console.error("Re-running the script resumes the remainder (idempotent filters).");
      process.exit(1);
    }
  }

  // --- delete GCS objects ---
  let deletedPrefixes = 0;
  if (!skipFiles) {
    console.log(`\nDeleting GCS objects (${prefixes.length} prefixes)...`);
    for (const prefix of prefixes) {
      await withRetry(`deleteFiles ${prefix}`, () => bucket.deleteFiles({ prefix, force: true }));
      deletedPrefixes++;
      if (deletedPrefixes % 50 === 0) console.log(`  ...${deletedPrefixes}/${prefixes.length} prefixes`);
    }
    // row-derived stragglers whose prefix drifted from convention
    await pooled(explicitPaths, 8, async (p) => {
      try {
        await bucket.file(p).delete();
      } catch (e: unknown) {
        const code = (e as { code?: number }).code;
        if (code !== 404) throw e; // already gone = success
      }
    });
  }

  // --- verification pass (mandatory) ---
  console.log("\nVerifying...");
  const remaining: Record<string, number> = {};
  let leftoverRows = 0;
  for (const table of DELETION_ORDER) {
    const n = await countSpecRows(supabase, TABLE_SPECS[table], closure);
    if (n > 0) {
      remaining[table] = n;
      leftoverRows += n;
      console.error(`  STILL PRESENT: ${table} has ${n} row(s)`);
    }
  }
  const clsAfter = await resolveClass(supabase, cls.id);
  if (clsAfter) {
    leftoverRows++;
    console.error("  STILL PRESENT: classes row");
  }
  let leftoverObjects = 0;
  if (!skipFiles) {
    for (const prefix of prefixes) {
      const [files] = await withRetry(`verify list ${prefix}`, () =>
        bucket.getFiles({ prefix, autoPaginate: true })
      );
      if (files.length > 0) {
        leftoverObjects += files.length;
        console.error(`  STILL PRESENT: ${files.length} object(s) under ${prefix}`);
      }
    }
  }

  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
  const report = {
    tool: "delete-class",
    completedAt: new Date().toISOString(),
    target: { env, url: target.url, bucket: target.bucketName },
    classUuid: cls.id,
    classTextId: cls.class_id,
    backupDir,
    deletedRowsPerTable: deletedCounts,
    totalDeletedRows: totalDeleted,
    deletedPrefixes,
    bytesFreedEstimate: manifest.gcs.totalBytes,
    skipFiles,
    verification: {
      leftoverRows,
      leftoverObjects,
      remainingPerTable: remaining,
      ok: leftoverRows === 0 && leftoverObjects === 0,
    },
  };
  await writeFile(join(backupDir, "deletion-report.json"), JSON.stringify(report, null, 2), "utf8");

  if (leftoverRows > 0 || leftoverObjects > 0) {
    console.error(
      `\nVERIFICATION FAILED: ${leftoverRows} row(s) / ${leftoverObjects} object(s) remain. See deletion-report.json. Re-run to resume.`
    );
    process.exit(1);
  }
  console.log(
    `\nDeletion complete & verified. ${totalDeleted} rows removed, ~${fmtBytes(manifest.gcs.totalBytes)} of storage freed.`
  );
  console.log(`Report: ${join(backupDir, "deletion-report.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
