"use client";

import { List } from "lucide-react";

import { Button } from "@/components/ui/button";

interface AiFunctionBrowseModelsButtonProps {
  onClick: () => void;
}

export default function AiFunctionBrowseModelsButton({
  onClick,
}: AiFunctionBrowseModelsButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0"
      onClick={onClick}
    >
      <List className="mr-1.5 h-3.5 w-3.5" />
      Browse models
    </Button>
  );
}
