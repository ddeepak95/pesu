import Link from "next/link";
import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import WalletsManagementView from "@/components/Settings/WalletsManagementView";
import { requireSuperAdmin } from "@/lib/dal";
import { getInstitution, listClassesInInstitution } from "@/lib/queries/institutions";
import { getDefaultClassWalletCredits, listWalletsForInstitution } from "@/lib/queries/aiCreditWallets";

export const metadata = {
  title: "AI credit wallets",
};

export default async function PlatformInstitutionWalletsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const { supabase } = await requireSuperAdmin();

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  const [wallets, classes, defaultClassWalletCredits] = await Promise.all([
    listWalletsForInstitution(supabase, id),
    listClassesInInstitution(supabase, id),
    getDefaultClassWalletCredits(supabase, id),
  ]);

  return (
    <PageLayout>
      <div className="space-y-6">
        <header>
          <Link
            href={`/platform/institutions/${id}`}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Back to institution
          </Link>
          <h1 className="text-2xl font-semibold mt-2">
            AI credit wallets — {institution.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Fund and configure enforcement for this institution&apos;s AI usage.
            Only a platform super admin can toggle BYOK self-service below.
          </p>
        </header>

        <WalletsManagementView
          institution={institution}
          basePath="platform"
          viewerRole="super_admin"
          wallets={wallets}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          defaultClassWalletCredits={defaultClassWalletCredits}
          notice={{ ok, error }}
        />
      </div>
    </PageLayout>
  );
}
