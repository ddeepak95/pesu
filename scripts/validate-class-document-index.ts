import assert from "node:assert/strict";
import { buildDocumentIndex } from "../src/lib/classDocuments/index";
import { includeFigureGroupLabels } from "../src/lib/classDocuments/figureLabels";

const markdown = `<!-- Page 1 -->
# Cell structure

The nucleus stores genetic material.

| Part | Role |
| --- | --- |
| Nucleus | Stores DNA |

<!-- Page 2 -->
Figure 50.3 has panels A and B.

![Panel A](figures/1.png)
![Panel B](figures/2.png)

Figure 50.3. Two views of the same structure.`;
const labels = includeFigureGroupLabels(["Figure 50.3A"]);
assert.deepEqual(labels, ["Figure 50.3", "Figure 50.3A"]);
const figures = [1, 2].map((order) => ({
  id: `00000000-0000-4000-8000-00000000000${order}`,
  page_number: 2, figure_order: order,
  storage_path: `class-documents/00000000-0000-4000-8000-000000000000/figures/${order}.png`,
  description: `Panel ${order === 1 ? "A" : "B"}`, selected: true,
  source_labels: includeFigureGroupLabels([`Figure 50.3${order === 1 ? "A" : "B"}`]),
  label_source: "teacher" as const,
}));
const index = buildDocumentIndex(markdown, figures);
assert.equal(index.figures.filter((figure) => figure.source_labels.includes("Figure 50.3")).length, 2);
assert(index.figures.every((figure) => figure.caption?.startsWith("Figure 50.3.")));
assert(index.chunks.some((chunk) => chunk.page_number === 1 && markdown.slice(chunk.start, chunk.end).includes("Nucleus | Stores DNA")));
assert(index.chunks.some((chunk) => chunk.page_number === 2 && markdown.slice(chunk.start, chunk.end).includes("Figure 50.3")));
assert(index.chunks.every((chunk) => chunk.start >= 0 && chunk.end <= markdown.length && chunk.start < chunk.end));
process.stdout.write("Class document index: page offsets, table text, and figure panels valid.\n");
