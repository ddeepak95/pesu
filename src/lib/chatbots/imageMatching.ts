import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Image, Definition, RootContent } from "mdast";
import type { ChatbotImage, ChatbotImageMapping } from "@/types/chatbot";
import { remarkStandaloneImages } from "@/lib/remarkStandaloneImages";

export interface ImageOccurrence { id: string; url: string; alt: string; context: string }

/** Shared AST traversal keeps reference images, repeated URLs and standalone URLs in sync. */
export function chatbotImageNodes(tree: Root): Image[] {
  const definitions = new Map<string, Definition>();
  const walk = (node: Root | RootContent, visit: (node: RootContent, parent: Root | RootContent, index: number) => void) => {
    if (!("children" in node)) return;
    node.children.forEach((child, i) => {
      visit(child as RootContent, node, i);
      walk(("children" in node ? node.children[i] : child) as RootContent, visit);
    });
  };
  walk(tree, node => { if (node.type === "definition") definitions.set(node.identifier.toLowerCase(), node); });
  const images: Image[] = [];
  walk(tree, (node, parent, i) => {
    if (node.type === "imageReference") {
      const d = definitions.get(node.identifier.toLowerCase());
      if (d && "children" in parent) {
        const image: Image = { type: "image", url: d.url, alt: node.alt, title: d.title, position: node.position };
        (parent.children as RootContent[])[i] = image;
        images.push(image);
      }
    } else if (node.type === "image") images.push(node);
  });
  return images;
}

export function remarkChatbotImageOccurrences() {
  return (tree: Root) => {
    chatbotImageNodes(tree).forEach((node, index) => {
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, "data-image-occurrence": `image_${index}` } };
    });
  };
}

export function extractChatbotImages(content: string): ImageOccurrence[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStandaloneImages);
  const tree = processor.runSync(processor.parse(content)) as Root;
  return chatbotImageNodes(tree).flatMap((node, index) => {
    if (!/^https?:\/\//i.test(node.url)) return [];
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? start;
    return [{ id: `image_${index}`, url: node.url, alt: node.alt ?? "",
      context: content.slice(Math.max(0, start - 600), Math.min(content.length, end + 600)) }];
  });
}

export function validateImageMatches(answers: unknown, occurrences: ImageOccurrence[], images: ChatbotImage[], action: "append" | "replace"): ChatbotImageMapping[] {
  if (!Array.isArray(answers)) return [];
  return occurrences.flatMap(occurrence => {
    const candidates = answers.filter(a => a && a.name === occurrence.id);
    if (candidates.length !== 1 || candidates[0].type !== "choice") return [];
    const image = images.find(i => i.id === candidates[0].choice && i.status === "ready");
    return image ? [{ occurrence_id: occurrence.id, original_url: occurrence.url, image_id: image.id,
      action, description: image.description }] : [];
  });
}
