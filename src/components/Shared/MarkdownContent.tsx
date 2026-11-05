"use client";
import { createContext, useContext } from "react";
import { ImageIcon } from "lucide-react";
import type { ChatbotImageMapping } from "@/types/chatbot";
import { remarkChatbotImageOccurrences } from "@/lib/chatbots/imageMatching";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { remarkStandaloneImages } from "@/lib/remarkStandaloneImages";
import { normalizeMarkdownImageUrl } from "@/lib/markdownImageUrl";
import MarkdownImage from "./MarkdownImage";
import { cn } from "@/lib/utils";

const ImageContext = createContext<{
  imageMappings: ChatbotImageMapping[]; messageId?: string; deferImages: boolean; showOriginalImages: boolean;
}>({ imageMappings: [], deferImages: false, showOriginalImages: false });

const ChatMarkdownImage: NonNullable<Components["img"]> = ({ src, alt, title, node }) => {
  const { imageMappings, messageId, deferImages, showOriginalImages } = useContext(ImageContext);
  if (deferImages) return (
    <span
      role="status"
      aria-label="Loading image"
      className="my-3 flex aspect-video w-full max-w-sm items-center justify-center rounded-md border border-border bg-muted motion-safe:animate-pulse"
    >
      <ImageIcon aria-hidden="true" className="size-10 text-muted-foreground/40" />
    </span>
  );
  if (typeof src !== "string" || !src) return null;
  const occurrence = node?.properties?.["data-image-occurrence"];
  const mapping = imageMappings.find(m => m.occurrence_id === occurrence);
  if (!mapping || !messageId) return <MarkdownImage key={src} src={src} alt={alt} title={title} />;
  const uploaded = `/api/chatbots/images/${encodeURIComponent(mapping.image_id)}?messageId=${encodeURIComponent(messageId)}`;
  return <>
    {mapping.action === "append" && <MarkdownImage key={src} src={src} alt={alt} title={title} />}
    <MarkdownImage key={uploaded} src={uploaded} alt={mapping.description} originalUrl={mapping.original_url} />
    {showOriginalImages && <a href={mapping.original_url} target="_blank" rel="noopener noreferrer" className="block text-xs underline">Original image</a>}
  </>;
};
const markdownComponents: Components = {
  img: ChatMarkdownImage,
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-semibold text-foreground" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-semibold text-foreground" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-semibold text-foreground" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="text-sm leading-relaxed text-foreground" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="list-decimal space-y-1 pl-5 text-sm text-foreground"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      className="text-glaucous-600 underline underline-offset-4 hover:text-glaucous-700"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-border pl-4 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  pre: ({ children, ...props }) => (
    <pre
      className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code className="text-xs font-mono text-foreground" {...props}>
        {children}
      </code>
    );
  },
};

export default function MarkdownContent({
  content,
  className,
  renderStandaloneImages = false,
  imageMappings = [], messageId, deferImages = false, showOriginalImages = false,
}: {
  content: string;
  className?: string;
  renderStandaloneImages?: boolean;
  imageMappings?: ChatbotImageMapping[];
  messageId?: string;
  deferImages?: boolean;
  showOriginalImages?: boolean;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <ImageContext.Provider value={{ imageMappings, messageId, deferImages, showOriginalImages }}>
      <ReactMarkdown
        remarkPlugins={renderStandaloneImages ? [remarkGfm, remarkBreaks, remarkStandaloneImages, remarkChatbotImageOccurrences] : [remarkGfm, remarkBreaks]}
        components={markdownComponents}
        urlTransform={(url, key, node) => {
          const safeUrl = defaultUrlTransform(url);
          return node.tagName === "img" && key === "src" ? normalizeMarkdownImageUrl(safeUrl) : safeUrl;
        }}
      >
        {content}
      </ReactMarkdown>
      </ImageContext.Provider>
    </div>
  );
}
