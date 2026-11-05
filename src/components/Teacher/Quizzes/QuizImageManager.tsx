"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MarkdownImage from "@/components/Shared/MarkdownImage";
import { useQuizImages, type QuizImageListItem } from "@/hooks/swr/useQuizImages";
import type { MCQQuestion } from "@/types/quiz";

export default function QuizImageManager({ classId, questions, disabled, onRemove, onPendingChange }: {
  classId: string;
  questions: MCQQuestion[];
  disabled: boolean;
  onRemove: (imageId: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const images = useQuizImages(classId);
  const [selected, setSelected] = useState<QuizImageListItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const usedInForm = (id: string) => questions.some(q => q.prompt.includes(`/api/quizzes/images/${id}`));

  async function deleteImage() {
    if (!selected || usedInForm(selected.id) || pending) return;
    setPending(true);
    onPendingChange(true);
    setError(null);
    try {
      const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/quiz-images`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not delete image. Please retry.");
      setSelected(null);
      setNotice("Image permanently deleted from storage.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete image. Please retry.");
    } finally {
      await images.mutate().catch(() => undefined);
      setPending(false);
      onPendingChange(false);
    }
  }

  return <section className="space-y-3 rounded-md border p-4" aria-label="Uploaded question images">
    <h2 className="font-semibold">Uploaded question images</h2>
    <p className="text-sm text-muted-foreground">Images uploaded to this class. Remove an image from your questions and save the quiz before deleting it permanently. Images used by other quizzes, including copies, cannot be deleted.</p>
    {images.error && <div role="alert" className="text-sm text-destructive">
      Could not load images. <Button type="button" variant="link" onClick={() => void images.mutate()}>Retry</Button>
    </div>}
    {images.data?.length === 0 && <p className="text-sm text-muted-foreground">No uploaded images.</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {images.data?.map(image => {
        const inForm = usedInForm(image.id);
        return <div key={image.id} className="min-w-0 space-y-2 rounded-md border p-3">
          {image.status === "ready" && <div className="max-h-40 overflow-auto"><MarkdownImage src={`/api/quizzes/images/${image.id}`} alt={image.filename} /></div>}
          <p className="break-all text-sm font-medium">{image.filename}</p>
          <p className="text-xs text-muted-foreground">{image.status === "deleting" ? "Deletion incomplete. Retry to finish." : image.referenceCount ? `Used by ${image.referenceCount} saved quiz${image.referenceCount === 1 ? "" : "zes"}.` : "Not used by any saved quiz."}</p>
          <div className="flex flex-wrap gap-2">
            {inForm && <Button type="button" variant="outline" size="sm" disabled={disabled || pending} onClick={() => {
              onRemove(image.id);
              setNotice("Image removed from questions. Save the quiz to update its image references. Any image URLs in links or code must be removed manually.");
            }}>Remove from questions</Button>}
            <Button type="button" variant="destructive" size="sm"
              disabled={disabled || pending || inForm || image.referenceCount > 0}
              onClick={() => { setSelected(image); setError(null); }}>
              <Trash2 className="mr-2 h-4 w-4" />{image.status === "deleting" ? "Retry deletion" : "Delete permanently"}
            </Button>
          </div>
        </div>;
      })}
    </div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !pending) setSelected(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently delete image?</DialogTitle>
          <DialogDescription>This deletes “{selected?.filename}” from storage and cannot be undone. Images still used by a saved quiz are protected.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setSelected(null)}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={pending || (selected ? usedInForm(selected.id) : true)} onClick={() => void deleteImage()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
