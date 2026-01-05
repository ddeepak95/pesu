"use client";

function getYouTubeEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);

    // youtu.be/<id>
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    // youtube.com
    if (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com" ||
      url.hostname === "m.youtube.com"
    ) {
      // /watch?v=<id>
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      // /embed/<id>
      if (url.pathname.startsWith("/embed/")) {
        const id = url.pathname.split("/embed/")[1]?.split("/")[0]?.trim();
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      // /shorts/<id>
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/shorts/")[1]?.split("/")[0]?.trim();
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }
  } catch {
    // ignore invalid URLs
  }

  return null;
}

interface YouTubeEmbedProps {
  videoUrl: string;
  title?: string;
}

/**
 * Shared component for displaying YouTube video embeds
 * Can be used by both teachers and students
 */
export default function YouTubeEmbed({ videoUrl, title = "YouTube video" }: YouTubeEmbedProps) {
  const embedUrl = getYouTubeEmbedUrl(videoUrl);

  if (!embedUrl) {
    return (
      <a
        className="text-sm underline underline-offset-4"
        href={videoUrl}
        target="_blank"
        rel="noreferrer"
      >
        {videoUrl}
      </a>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full pt-[56.25%] overflow-hidden rounded-md border">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <a
        className="text-sm underline underline-offset-4"
        href={videoUrl}
        target="_blank"
        rel="noreferrer"
      >
        Open on YouTube
      </a>
    </div>
  );
}




