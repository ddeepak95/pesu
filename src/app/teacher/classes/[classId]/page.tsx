import PageLayout from "@/components/PageLayout";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  return (
    <PageLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold">Class Details</h1>
        <p className="mt-4 text-muted-foreground">Class ID: {classId}</p>
      </div>
    </PageLayout>
  );
}

