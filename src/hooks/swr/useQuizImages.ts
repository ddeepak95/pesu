import useSWR, { mutate } from "swr";

export interface QuizImageListItem {
  id: string;
  filename: string;
  status: "ready" | "deleting";
  referenceCount: number;
}

export const quizImagesKey = (classId: string) => ["quizImages", classId];
export const invalidateQuizImages = (classId: string) => mutate(quizImagesKey(classId));

export function useQuizImages(classId: string) {
  return useSWR<QuizImageListItem[]>(quizImagesKey(classId), async () => {
    const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/quiz-images`);
    if (!response.ok) throw new Error("Could not load uploaded images. Please retry.");
    return (await response.json()).images;
  });
}
