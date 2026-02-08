import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/convoed-logo.svg"
          alt="ConvoEd Logo"
          className="h-12 w-auto dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/convoed-logo-dark.svg"
          alt="ConvoEd Logo"
          className="h-12 w-auto hidden dark:block"
        />

        <div className="flex flex-col gap-4 w-full">
          <Button asChild size="lg" className="w-full text-lg py-6">
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
