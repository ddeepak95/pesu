import type { Root } from "mdast";

/** Render URL-only bot output as an image without interpreting raw HTML or SVG. */
export function remarkStandaloneImages() {
  return (tree: Root) => {
    tree.children = tree.children.map((node) => {
      let candidate: string | undefined;
      if (node.type === "code" && (!node.lang || ["text", "plaintext"].includes(node.lang))) {
        candidate = node.value.trim();
      } else if (node.type === "paragraph" && node.children.length === 1) {
        const child = node.children[0];
        if (child.type === "text") candidate = child.value.trim();
        if (child.type === "link" && child.children.length === 1 &&
          child.children[0].type === "text" && child.children[0].value === child.url) candidate = child.url;
      }
      if (!candidate || /\s/.test(candidate)) return node;
      try {
        const url = new URL(candidate);
        if (!["https:", "http:"].includes(url.protocol) ||
          !/\.(svg|png|jpe?g|gif|webp|avif)$/i.test(url.pathname) ||
          url.pathname.includes("/wiki/")) return node;
        return { type: "paragraph", children: [{ type: "image", url: candidate, alt: "Illustration", title: null }] };
      } catch { return node; }
    });
  };
}
