"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default function BackButton({
  label = "Back",
  className,
  href,
}: {
  label?: string;
  className?: string;
  href?: string;
}) {
  const router = useRouter();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        onClick={handleClick}
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
