import { Card, CardContent } from "@/components/ui/card";
import YouTubeEmbed from "@/components/Shared/YouTubeEmbed";
import MarkdownContent from "@/components/Shared/MarkdownContent";

export default function LearningContentViewer({
  title,
  body,
  videoUrl,
}: {
  title: string;
  body?: string | null;
  videoUrl?: string | null;
}) {
  const hasBody = Boolean(body?.trim());
  const hasVideo = Boolean(videoUrl?.trim());

  if (!hasBody && !hasVideo) {
    return null;
  }

  return (
    <div>
      <div className="space-y-6 pt-6">
        {hasBody && <MarkdownContent content={body!.trim()} />}
        {hasVideo && <YouTubeEmbed videoUrl={videoUrl!} title={title} />}
      </div>
    </div>
  );
}
