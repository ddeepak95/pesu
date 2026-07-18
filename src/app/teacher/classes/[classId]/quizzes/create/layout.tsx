import { guardContentTypeCreation } from "@/lib/settings/contentTypeGuard";

export const metadata = {
  title: "Create Quiz",
};

export default async function CreateQuizLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await guardContentTypeCreation(classId, "quiz");
  return children;
}
