import { unified } from "unified";
import remarkParse from "remark-parse";

interface MarkdownNode {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/** Remove image occurrences, preserving surrounding text, links and code. */
export function removeQuizImage(prompt: string, imageId: string): string {
  const tree = unified().use(remarkParse).parse(prompt) as MarkdownNode;
  const target = `/api/quizzes/images/${imageId}`;
  const definitions = new Map<string, string>();
  const ranges: [number, number][] = [];
  function visit(node: MarkdownNode, fn: (node: MarkdownNode) => void) {
    fn(node);
    node.children?.forEach(child => visit(child, fn));
  }
  visit(tree, node => {
    if (node.type === "definition" && node.identifier && node.url) definitions.set(node.identifier, node.url);
  });
  visit(tree, node => {
    const url = node.type === "image" ? node.url : node.type === "imageReference" ? definitions.get(node.identifier ?? "") : null;
    if (url !== target) return;
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) ranges.push([start, end]);
  });
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) prompt = prompt.slice(0, start) + prompt.slice(end);
  // Unused reference definitions would still be collected by the database's
  // conservative URL scanner. Remove a matching definition only when no image
  // or ordinary link still uses that identifier.
  const remaining = unified().use(remarkParse).parse(prompt) as MarkdownNode;
  const used = new Set<string>();
  visit(remaining, node => {
    if ((node.type === "imageReference" || node.type === "linkReference") && node.identifier) used.add(node.identifier);
  });
  const definitionsToRemove: [number, number][] = [];
  visit(remaining, node => {
    if (node.type !== "definition" || node.url !== target || used.has(node.identifier ?? "")) return;
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) definitionsToRemove.push([start, end]);
  });
  for (const [start, end] of definitionsToRemove.sort((a, b) => b[0] - a[0])) prompt = prompt.slice(0, start) + prompt.slice(end);
  return prompt;
}
