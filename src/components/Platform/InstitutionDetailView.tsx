"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import InstitutionSettingsTabs from "@/components/Settings/InstitutionSettingsTabs";
import InstitutionClassCard from "@/components/Platform/InstitutionClassCard";
import CreateInstitutionClass from "@/components/Platform/CreateInstitutionClass";
import ManageInstitutionAdminInvite from "@/components/Platform/ManageInstitutionAdminInvite";
import InstitutionDangerZoneSection from "@/components/Platform/InstitutionDangerZoneSection";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showSuccessToast } from "@/lib/toast";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type {
  ClassInstitutionMove,
  Institution,
  InstitutionMember,
} from "@/lib/queries/institutions";
import type { Class } from "@/types/class";
import type { EffectiveSettings } from "@/lib/settings/resolve";
import type { AiInstitutionPolicy } from "@/types/aiSettings";
import type { UsageBreakdownRow } from "@/components/Platform/Usage/UsageBreakdownTable";
import type { WalletFundingEntry } from "@/lib/queries/aiUsage";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";

import {
  addInstitutionAdminRequestAction,
  removeInstitutionAdminAction,
} from "@/app/platform/actions";

export interface InstitutionDetailViewProps {
  institution: Institution;
  members: InstitutionMember[];
  classes: Class[];
  moves: ClassInstitutionMove[];
  /**
   * `[user_id, email]` entry list. Passed as a plain array (not `Map`) so the
   * prop is RSC-serializable across the server → client boundary.
   */
  userEmailEntries: Array<[string, string]>;
  /** `[institution_id, name]` entry list for displaying move sources/targets. */
  institutionNameEntries: Array<[string, string]>;
  viewerRole: ViewerRole;
  /**
   * Optional back-link target. When both `backHref` and `backLabel` are
   * provided the header renders the link; otherwise it's omitted (e.g. the
   * single-institution admin case where there's nowhere meaningful to go).
   */
  backHref?: string;
  backLabel?: string;
  effectiveSettings: EffectiveSettings;
  institutionPolicy: AiInstitutionPolicy;
  /**
   * Base href used by the Classes tab to link into the per-class override
   * drill-down. The view appends `/{classDbId}`.
   */
  classOverrideHrefBase: string;
  /** Optional success/error banner copy. */
  notice?: { ok?: string; error?: string };
  /** "Manage Activity Templates" link target for this institution's template library. */
  activityTemplatesManageHref: string;
  /** AI management tab data — wallets, usage, access (see InstitutionSettingsTabs). */
  aiWallets: AiCreditWallet[];
  aiClassAccessEnabled: Record<string, boolean>;
  aiDefaultClassWalletCredits: number | null;
  aiPlatformWalletBalance: number;
  aiUsageBreakdown: UsageBreakdownRow[];
  aiFundingHistory: WalletFundingEntry[];
}

type ActiveTab = "settings" | "classes";

function parseTab(raw: string | null): ActiveTab {
  return raw === "classes" ? "classes" : "settings";
}

/**
 * Shared institution view used by `/platform/institutions/[id]` (super-admin
 * surface) and `/admin/institutions/[id]` (institution-admin surface).
 *
 * Tabs match the underline pattern used by `ClassDetailClient`. URL state
 * lives in `?tab=settings|classes`.
 *
 * Capability gating happens via `viewerRole`:
 *   * super_admin       — manage members, manage settings, all toggles
 *   * institution_admin — read members, manage settings (subject to locks)
 */
export default function InstitutionDetailView({
  institution,
  members,
  classes,
  moves,
  userEmailEntries,
  institutionNameEntries,
  viewerRole,
  backHref,
  backLabel,
  effectiveSettings,
  institutionPolicy,
  classOverrideHrefBase,
  notice,
  activityTemplatesManageHref,
  aiWallets,
  aiClassAccessEnabled,
  aiDefaultClassWalletCredits,
  aiPlatformWalletBalance,
  aiUsageBreakdown,
  aiFundingHistory,
}: InstitutionDetailViewProps) {
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const isSuper = viewerRole === "super_admin";

  const userEmails = useMemo(
    () => new Map(userEmailEntries),
    [userEmailEntries]
  );
  const institutionNameById = useMemo(
    () => new Map(institutionNameEntries),
    [institutionNameEntries]
  );

  const activeTab = useMemo(
    () => parseTab(searchParams.get("tab")),
    [searchParams]
  );

  // Canonicalize the tab into the URL on mount (matches ClassDetailClient).
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "settings" || t === "classes") return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "settings");
    router.replace(`?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", parseTab(value));
    router.replace(`?${next.toString()}`);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        {backHref && backLabel && (
          <Link
            href={backHref}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; {backLabel}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">{institution.name}</h1>
        <p className="text-muted-foreground text-sm">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {institution.id}
          </code>
          {institution.slug && (
            <>
              {" · "}slug{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {institution.slug}
              </code>
            </>
          )}
          {" · "}status {institution.status}
          {institution.is_default && (
            <>
              {" · "}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                default
              </span>
            </>
          )}
        </p>
      </div>

      {(notice?.ok || notice?.error) && (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            notice.error
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {notice.error ?? notice.ok}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full overflow-visible"
      >
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-[var(--class-underline-tab-rule)] bg-transparent p-0">
          <TabsTrigger
            value="settings"
            className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
          >
            Settings
          </TabsTrigger>
          <TabsTrigger
            value="classes"
            className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
          >
            Classes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 pt-6">
          <InstitutionSettingsTabs
            institutionId={institution.id}
            institution={institution}
            viewerRole={viewerRole}
            effectiveSettings={effectiveSettings}
            institutionPolicy={institutionPolicy}
            activityTemplatesManageHref={activityTemplatesManageHref}
            aiWallets={aiWallets}
            aiClasses={classes.map((c) => ({
              id: c.id,
              name: c.name,
              shortId: c.class_id,
            }))}
            aiClassAccessEnabled={aiClassAccessEnabled}
            aiDefaultClassWalletCredits={aiDefaultClassWalletCredits}
            aiPlatformWalletBalance={aiPlatformWalletBalance}
            aiUsageBreakdown={aiUsageBreakdown}
            aiFundingHistory={aiFundingHistory}
            adminsSection={
              <AdminsCard
                institutionId={institution.id}
                members={members}
                userEmails={userEmails}
                isSuper={isSuper}
              />
            }
            dangerZoneSection={
              isSuper ? (
                <InstitutionDangerZoneSection institution={institution} />
              ) : undefined
            }
          />
        </TabsContent>

        <TabsContent value="classes" className="space-y-8 pt-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">
                Classes ({classes.length})
              </h2>
              <CreateInstitutionClass
                institutionId={institution.id}
                classSettingsHrefBase={classOverrideHrefBase}
                defaultLanguage={institution.preferred_language}
              />
            </div>
            {classes.length === 0 ? (
              <div className="rounded border border-dashed px-6 py-12 text-center text-sm text-muted-foreground space-y-3">
                <p>No classes under this institution.</p>
                <CreateInstitutionClass
                  institutionId={institution.id}
                  classSettingsHrefBase={classOverrideHrefBase}
                  defaultLanguage={institution.preferred_language}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {classes.map((c) => (
                  <InstitutionClassCard
                    key={c.id}
                    classData={c}
                    detailHrefBase={classOverrideHrefBase}
                    canMove={viewerRole === "super_admin"}
                    currentInstitutionId={institution.id}
                    institutions={institutionNameEntries}
                  />
                ))}
              </div>
            )}
          </section>

          <RecentMovesSection
            moves={moves}
            userEmails={userEmails}
            institutionNameById={institutionNameById}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function AdminsCard({
  institutionId,
  members,
  userEmails,
  isSuper,
}: {
  institutionId: string;
  members: InstitutionMember[];
  userEmails: Map<string, string>;
  isSuper: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admins</CardTitle>
        <CardDescription>
          {isSuper
            ? "Add or remove institution admins by email."
            : "People with admin access to this institution."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Added</th>
                {isSuper && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">
                    {userEmails.get(m.user_id) ?? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {m.user_id}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{m.role}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {m.created_at.slice(0, 10)}
                  </td>
                  {isSuper && (
                    <td className="px-3 py-2 text-right">
                      <form action={removeInstitutionAdminAction}>
                        <input
                          type="hidden"
                          name="institutionId"
                          value={institutionId}
                        />
                        <input
                          type="hidden"
                          name="userId"
                          value={m.user_id}
                        />
                        <button
                          type="submit"
                          className="text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-muted-foreground"
                    colSpan={isSuper ? 4 : 3}
                  >
                    No admins yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isSuper && <AddAdminForm institutionId={institutionId} />}

        <ManageInstitutionAdminInvite institutionId={institutionId} />
      </CardContent>
    </Card>
  );
}

function AddAdminForm({ institutionId }: { institutionId: string }) {
  const router = useTrackedRouter();
  const [email, setEmail] = useState("");
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addInstitutionAdminRequestAction({
        institutionId,
        email: trimmed,
      });
      if (!result.ok) {
        setErrorMessage(result.error ?? "Failed to add admin");
        setErrorOpen(true);
        return;
      }
      showSuccessToast(`Added ${trimmed} as admin`);
      setEmail("");
      router.refresh();
    });
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded border p-4"
      >
        <label className="flex flex-1 min-w-64 flex-col text-sm">
          <span className="mb-1">Add admin by email</span>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="rounded border px-2 py-1.5 text-sm"
            placeholder="user@example.com"
          />
        </label>
        <Button type="submit" disabled={isPending || !email.trim()}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "Adding…" : "Add admin"}
        </Button>
      </form>

      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Could not add admin</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setErrorOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecentMovesSection({
  moves,
  userEmails,
  institutionNameById,
}: {
  moves: ClassInstitutionMove[];
  userEmails: Map<string, string>;
  institutionNameById: Map<string, string>;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">
        Recent moves involving this institution
      </h2>
      {moves.length === 0 ? (
        <p className="text-muted-foreground text-sm">No moves recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {m.created_at.replace("T", " ").slice(0, 16)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.class_id}</td>
                  <td className="px-3 py-2">
                    {institutionNameById.get(m.from_institution_id) ??
                      m.from_institution_id}
                  </td>
                  <td className="px-3 py-2">
                    {institutionNameById.get(m.to_institution_id) ??
                      m.to_institution_id}
                  </td>
                  <td className="px-3 py-2">
                    {userEmails.get(m.moved_by) ?? m.moved_by}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {m.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
