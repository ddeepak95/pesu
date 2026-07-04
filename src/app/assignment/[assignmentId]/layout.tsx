import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("title, is_public")
    .eq("assignment_id", assignmentId)
    .eq("status", "active")
    .maybeSingle();

  if (!assignment?.is_public) {
    return { title: "Assignment" };
  }

  const title = assignment.title;
  return {
    title,
    openGraph: { title },
    twitter: { title },
  };
}

export default function PublicAssignmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
