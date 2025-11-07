import PageLayout from "@/components/PageLayout";
import CreateClass from "@/components/Teacher/Classes/CreateClass";

export default function ClassesPage() {
  return (
    <PageLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Classes</h1>
        <CreateClass />
      </div>
    </PageLayout>
  );
}

