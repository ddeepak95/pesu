import PageLayout from "@/components/PageLayout";

export const metadata = {
  title: "Teacher Dashboard",
};

export default function TeacherPage() {
  return (
    <PageLayout>
      <div>
        <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
        <p className="mt-4 text-muted-foreground">Welcome to your dashboard!</p>
      </div>
    </PageLayout>
  );
}
