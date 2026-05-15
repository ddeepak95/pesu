import Link from "next/link";

import PageLayout from "@/components/PageLayout";
import PlatformAiConfigForm from "@/components/Settings/PlatformAiConfigForm";
import { requireSuperAdmin } from "@/lib/dal";
import { getPlatformAiConfigs } from "@/lib/queries/aiCapabilityConfigs";

export const metadata = {
  title: "Platform AI settings",
};

export default async function PlatformAiSettingsPage() {
  const { supabase } = await requireSuperAdmin();
  const initialEffective = await getPlatformAiConfigs(supabase);

  return (
    <PageLayout>
      <div className="space-y-6">
        <header>
          <Link
            href="/platform"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Back to platform admin
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Platform AI settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Default provider, model, and API keys for each text-based AI feature.
          </p>
        </header>

        <PlatformAiConfigForm
          viewerRole="super_admin"
          initialEffective={initialEffective}
        />
      </div>
    </PageLayout>
  );
}
