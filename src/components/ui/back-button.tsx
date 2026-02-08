"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default function BackButton({
  label = "Back",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}



