import { guardContentTypeCreation } from "@/lib/settings/contentTypeGuard";

export const metadata = {
  title: "Create Learning Content",
};

export default async function CreateLearningContentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await guardContentTypeCreation(classId, "learning_content");
  return children;
}
