import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <picture>
          <source
            srcSet="/convoed-logo-dark.svg"
            media="(prefers-color-scheme: dark)"
          />
          <img
            src="/convoed-logo.svg"
            alt="ConvoEd Logo"
            className="h-12 w-auto"
          />
        </picture>

        <div className="flex flex-col gap-4 w-full">
          <Button
            asChild
            size="lg"
            className="w-full text-lg py-6"
            style={{ color: "#fff" }}
          >
            <Link href="/student/classes">Student Login</Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full text-lg py-6"
          >
            <Link href="/teacher/classes">Teacher Login</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
