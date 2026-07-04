import en from "@/locales/en.json";

export const metadata = {
  title: {
    template: `%s | ${en.toolName}`,
    default: "My Classes",
  },
};

export default function TeacherClassesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
