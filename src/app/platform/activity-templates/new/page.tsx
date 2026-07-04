import PageLayout from "@/components/PageLayout";
import { SystemTemplateEditor } from "@/components/Platform/Templates/SystemTemplateEditor";
import { requireSuperAdmin } from "@/lib/dal";

export const metadata = {
  title: "New System Template",
};

/** Create a new system-owned (platform) activity template. */
export default async function NewSystemTemplatePage() {
  await requireSuperAdmin();

  return (
    <PageLayout>
      <SystemTemplateEditor />
    </PageLayout>
  );
}
