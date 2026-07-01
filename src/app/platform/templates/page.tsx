import PageLayout from "@/components/PageLayout";
import { SystemTemplateLibrary } from "@/components/Platform/Templates/SystemTemplateLibrary";
import { requireSuperAdmin } from "@/lib/dal";

export const metadata = {
  title: "System templates",
};

export default async function PlatformTemplatesPage() {
  // Gate on super-admin like the rest of /platform; no data is loaded — the
  // library is a UI mockup seeded client-side from the activity-type registry.
  await requireSuperAdmin();

  return (
    <PageLayout>
      <SystemTemplateLibrary />
    </PageLayout>
  );
}
