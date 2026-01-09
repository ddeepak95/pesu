"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Link as LinkIcon, Share2 } from "lucide-react";

interface AssignmentLinkShareProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  classId: string;
  isPublic: boolean;
}

export function AssignmentLinkShare({
  open,
  onOpenChange,
  assignmentId,
  classId,
  isPublic,
}: AssignmentLinkShareProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const publicLink = `${typeof window !== "undefined" ? window.location.origin : ""}/assignment/${assignmentId}`;
  const classroomLink = `${typeof window !== "undefined" ? window.location.origin : ""}/students/classes/${classId}/assignments/${assignmentId}`;

  const handleCopy = async (link: string, linkType: "public" | "classroom") => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(linkType);
      setTimeout(() => {
        setCopiedLink(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
      alert("Failed to copy link. Please try again.");
    }
  };

  const handleShare = async (link: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Assignment Link",
          text: "Check out this assignment",
          url: link,
        });
      } catch (err) {
        // User cancelled or error occurred
        if ((err as Error).name !== "AbortError") {
          console.error("Error sharing:", err);
        }
      }
    } else {
      // Fallback to copy if share API not available
      await handleCopy(link, isPublic && link === publicLink ? "public" : "classroom");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Assignment Links
          </DialogTitle>
          <DialogDescription>
            Copy or share links for students to access this assignment
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
        {/* Classroom Link - Always shown */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">Classroom Link</label>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this link with students enrolled in your class
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={classroomLink}
              className="flex-1 font-mono text-sm"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(classroomLink, "classroom")}
              className="shrink-0"
            >
              {copiedLink === "classroom" ? (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
            {'share' in navigator && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShare(classroomLink)}
                className="shrink-0"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            )}
          </div>
        </div>

        {/* Public Link - Only shown if assignment is public */}
        {isPublic && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">Public Link</label>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with anyone - no login required
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={publicLink}
                className="flex-1 font-mono text-sm"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(publicLink, "public")}
                className="shrink-0"
              >
                {copiedLink === "public" ? (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
              {'share' in navigator && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare(publicLink)}
                  className="shrink-0"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              )}
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
