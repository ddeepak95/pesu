"use client";

import { useState } from "react";
import { normalizeMarkdownImageUrl, wikimediaImageFallback } from "@/lib/markdownImageUrl";

export default function MarkdownImage({ src, alt, title }: { src: string; alt?: string; title?: string }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const normalized = normalizeMarkdownImageUrl(src);
  const fallback = wikimediaImageFallback(src);
  const current = !failedUrls.includes(normalized) ? normalized : fallback?.imageUrl;
  if (!current || failedUrls.includes(current)) {
    return <span className="my-3 block rounded-md border border-border p-3 text-sm text-muted-foreground">
      Image unavailable{alt ? `: ${alt}` : "."}{" "}
      {(fallback || /^https?:\/\//i.test(src)) && <a href={fallback?.searchUrl ?? src} target="_blank" rel="noopener noreferrer" className="underline">{fallback ? "Find an image on Wikimedia Commons" : "Open image link"}</a>}
    </span>;
  }
  // External educational images have unknown dimensions and arbitrary source hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current} alt={alt ?? ""} title={title} className="my-3 h-auto max-w-full rounded-md" onError={() => setFailedUrls(previous => previous.includes(current) ? previous : [...previous, current])} />;
}
