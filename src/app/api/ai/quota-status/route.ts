import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { getQuotaStatus, type WalletStatus } from "@/lib/ai/metering/quota";

/**
 * dev-docs/ai-usage-metering-phase3-plan.md §9 (D12) — a read-only quota
 * snapshot for a future in-product banner. Not wired into a specific page
 * yet. Auth'd to the class's teacher/admin, its institution's admin, or a
 * platform super admin; the actual wallet read runs through the service-role
 * getQuotaStatus (D4) once that's established.
 *
 * Dual-debit cap model: `pool` is the institution's credit pool, `classCap`
 * the class's own spending cap (unrestricted when the class has none). BYOK
 * usage is unmetered and has no status to report.
 */

interface PublicQuotaStatus {
  kind: "unrestricted" | "wallet";
  enforcement?: "off" | "warn" | "block";
  balance?: number;
  belowWarnThreshold?: boolean;
}

function toPublicStatus(status: WalletStatus): PublicQuotaStatus {
  if (status.kind === "unrestricted") return { kind: "unrestricted" };
  return {
    kind: "wallet",
    enforcement: status.enforcement,
    balance: status.balance,
    belowWarnThreshold: status.belowWarnThreshold,
  };
}

export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json({ error: "Missing classId" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const institutionId = await resolveInstitutionId(service, classId);

  const [{ data: isClassTeacherAdmin }, { data: isSuperAdmin }] = await Promise.all([
    supabase.rpc("is_class_teacher_admin", { p_class_id: classId }),
    supabase.rpc("is_platform_super_admin"),
  ]);

  let authorized = Boolean(isClassTeacherAdmin) || Boolean(isSuperAdmin);
  if (!authorized && institutionId) {
    const { data: isInstitutionAdmin } = await supabase.rpc("is_institution_admin", {
      p_institution_id: institutionId,
    });
    authorized = Boolean(isInstitutionAdmin);
  }

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!institutionId) {
    return NextResponse.json({
      pool: { kind: "unrestricted" } satisfies PublicQuotaStatus,
      classCap: { kind: "unrestricted" } satisfies PublicQuotaStatus,
    });
  }

  const status = await getQuotaStatus({ institutionId, classId });

  return NextResponse.json({
    pool: toPublicStatus(status.pool),
    classCap: toPublicStatus(status.classCap),
  });
}
