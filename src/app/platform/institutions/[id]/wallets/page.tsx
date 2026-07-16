import { redirect } from "next/navigation";

/**
 * Wallets moved into the institution's "AI management" tab
 * (Wallets & limits sub-tab, dev-docs/ai-usage-metering-phase4-plan.md
 * decision 2). This route stays alive as a redirect so old links/bookmarks
 * don't 404.
 */
export default async function PlatformInstitutionWalletsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/platform/institutions/${id}?tab=settings&settingsTab=ai`);
}
