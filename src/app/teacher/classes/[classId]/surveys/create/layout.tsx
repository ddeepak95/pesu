import { guardContentTypeCreation } from "@/lib/settings/contentTypeGuard";

export const metadata = {
  title: "Create Survey",
};

export default async function CreateSurveyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await guardContentTypeCreation(classId, "survey");
  return children;
}
