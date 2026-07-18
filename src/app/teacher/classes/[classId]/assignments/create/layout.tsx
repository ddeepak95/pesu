import { guardContentTypeCreation } from "@/lib/settings/contentTypeGuard";

export const metadata = {
  title: "Create Activity",
};

export default async function CreateAssignmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await guardContentTypeCreation(classId, "formative_assignment");
  return children;
}
