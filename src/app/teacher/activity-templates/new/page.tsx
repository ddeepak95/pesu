import PageLayout from "@/components/PageLayout";
import { UserTemplateEditor } from "@/components/Teacher/Templates/UserTemplateEditor";
import { verifySession } from "@/lib/dal";

export const metadata = {
  title: "New Template",
};

/** Create a new personal-library activity template. */
export default async function NewUserTemplatePage() {
  await verifySession();

  return (
    <PageLayout>
      <UserTemplateEditor />
    </PageLayout>
  );
}
