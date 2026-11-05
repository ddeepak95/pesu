import { NextRequest, NextResponse } from "next/server";
import { getStorageBucket } from "@/lib/firebase-admin";
import { QuizImageError, requireQuizImageRead } from "@/lib/quizzes/imagesServer";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, context: { params: Promise<{ imageId: string }> }) {
  try {
    const image = await requireQuizImageRead((await context.params).imageId);
    const [bytes] = await getStorageBucket().file(image.storage_path).download();
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": image.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return NextResponse.json({ error: "Image unavailable" }, { status: error instanceof QuizImageError ? error.status : 500 });
  }
}
