"use client";

import { useCallback, useState } from "react";
import { ImageIcon } from "lucide-react";
import { normalizeMarkdownImageUrl, wikimediaImageFallback } from "@/lib/markdownImageUrl";

export default function MarkdownImage({ src, alt, title, originalUrl }: { src: string; alt?: string; title?: string; originalUrl?: string }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const normalized = normalizeMarkdownImageUrl(src);
  const fallback = wikimediaImageFallback(src);
  const current = !failedUrls.includes(normalized) ? normalized : fallback?.imageUrl;
  const isLoaded = loadedUrl === current;
  const handleError = useCallback(() => {
    if (current) setFailedUrls(previous => previous.includes(current) ? previous : [...previous, current]);
  }, [current]);
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    // Cached images may finish before hydration attaches the load handler.
    if (!image?.complete || !current) return;
    if (image.naturalWidth > 0) setLoadedUrl(current);
    else handleError();
  }, [current, handleError]);
  if (!current || failedUrls.includes(current)) {
    return <span className="my-3 block rounded-md border border-border p-3 text-sm text-muted-foreground">
      Image unavailable{alt ? `: ${alt}` : "."}{" "}
      {(originalUrl || fallback || /^https?:\/\//i.test(src)) && <a href={originalUrl ?? fallback?.searchUrl ?? src} target="_blank" rel="noopener noreferrer" className="underline">{fallback ? "Find an image on Wikimedia Commons" : "Open image link"}</a>}
    </span>;
  }
  return <span className="relative my-3 block" aria-busy={!isLoaded}>
    {!isLoaded && <span
      role="status"
      aria-label="Loading image"
      className="flex aspect-video w-full max-w-sm items-center justify-center rounded-md border border-border bg-muted motion-safe:animate-pulse"
    >
      <ImageIcon aria-hidden="true" className="size-10 text-muted-foreground/40" />
    </span>}
    {/* External educational images have unknown dimensions and arbitrary source hosts. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      key={current}
      ref={imageRef}
      src={current}
      alt={alt ?? ""}
      title={title}
      aria-hidden={!isLoaded}
      className={`h-auto max-w-full rounded-md${isLoaded ? "" : " absolute inset-0 opacity-0"}`}
      onLoad={() => setLoadedUrl(current)}
      onError={handleError}
    />
  </span>;
}
