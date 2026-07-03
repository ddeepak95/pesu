import PageLayout from "@/components/PageLayout";
import { TemplateLibrary } from "@/components/Teacher/Templates/TemplateLibrary";
import { verifySession } from "@/lib/dal";
import { listMyTemplates } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "My Activity Templates",
};

export default async function TeacherTemplatesPage() {
  const { user, supabase } = await verifySession();
  const templates = await listMyTemplates(user.id, supabase);

  return (
    <PageLayout>
      <TemplateLibrary
        owner={{ scope: "user", userId: user.id }}
        initialTemplates={templates}
        title="My Activity Templates"
        description=""
        basePath="/teacher/activity-templates"
      />
    </PageLayout>
  );
}
