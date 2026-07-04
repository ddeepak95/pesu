import Link from "next/link";

import PageLayout from "@/components/PageLayout";
import { TemplateLibrary } from "@/components/Teacher/Templates/TemplateLibrary";
import { requireSuperAdmin } from "@/lib/dal";
import { listSystemTemplates } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "System templates",
};

export default async function PlatformTemplatesPage() {
  const { supabase } = await requireSuperAdmin();
  const templates = await listSystemTemplates(supabase);

  return (
    <PageLayout>
      <div className="space-y-6">
        <Link
          href="/platform"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to platform admin
        </Link>
        <TemplateLibrary
          owner={{ scope: "system" }}
          initialTemplates={templates}
          title="System template library"
          description="The built-in activity types, managed through the same editor every library uses. Toggle Default listed to control whether a type is automatically available in every class, or opt-in via Add from Library."
          basePath="/platform/activity-templates"
        />
      </div>
    </PageLayout>
  );
}
