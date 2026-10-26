import assert from "node:assert/strict";
import { test } from "node:test";
import {
  synchronizeFigureText,
  validateFigureManifest,
} from "../src/lib/classDocuments/validation";
import {
  buildDocumentIndex,
  type DocumentFigure,
} from "../src/lib/classDocuments/index";
import { markdownFromLayoutStage } from "../src/lib/classDocuments/layoutDraft";

const figures: DocumentFigure[] = ["A", "B"].map((panel, index) => ({
  id: `figure-${panel}`,
  page_number: 3,
  figure_order: index + 1,
  storage_path: `class-documents/doc/figures/${index + 1}.png`,
  description: `Panel ${panel}`,
  caption: `Teacher caption ${panel}`,
  selected: true,
  source_labels: ["Figure 50.3", `Figure 50.3${panel}`],
  label_source: "teacher",
  group_label: "Figure 50.3",
  panel_label: panel,
}));

const markdown =
  "<!-- Page 3 -->\n\n![Panel A](figures/1.png)\n\n![Panel B](figures/2.png)";

test("Document AI draft preserves page order and both figure placements", () => {
  const draft = markdownFromLayoutStage({
    pageCount: 3,
    figures,
    pages: [
      { pageNumber: 1, blocks: ["# Title", "First page text"] },
      { pageNumber: 2, blocks: ["| A | B |\n| --- | --- |\n| 1 | 2 |"] },
      {
        pageNumber: 3,
        blocks: ["![Panel A](figures/1.png)", "![Panel B](figures/2.png)"],
      },
    ],
  });
  assert.match(
    draft,
    /<!-- Page 1 -->[\s\S]*<!-- Page 2 -->[\s\S]*<!-- Page 3 -->/,
  );
  assert.deepEqual(validateFigureManifest(draft, figures), []);
  assert.throws(
    () =>
      markdownFromLayoutStage({
        pageCount: 2,
        figures: [],
        pages: [
          { pageNumber: 2, blocks: ["Wrong page"] },
          { pageNumber: 1, blocks: [] },
        ],
      }),
    /Invalid Document AI layout stage/,
  );
});

test("A/B images each have a placement and retain reviewed captions", () => {
  assert.deepEqual(validateFigureManifest(markdown, figures), []);
  assert.deepEqual(
    buildDocumentIndex(markdown, figures).figures.map(
      (figure) => figure.caption,
    ),
    ["Teacher caption A", "Teacher caption B"],
  );
});

test("missing, duplicate, wrong-page and duplicate-panel placements are reported", () => {
  assert.match(
    validateFigureManifest(
      markdown.replace("![Panel B](figures/2.png)", ""),
      figures,
    ).join(" "),
    /has 0 Markdown placements/,
  );
  assert.match(
    validateFigureManifest(
      `${markdown}\n![Again](figures/1.png)`,
      figures,
    ).join(" "),
    /has 2 Markdown placements/,
  );
  assert.match(
    validateFigureManifest(markdown.replace("Page 3", "Page 4"), figures).join(
      " ",
    ),
    /manifest says page 3/,
  );
  assert.match(
    validateFigureManifest(markdown, [
      { ...figures[0], panel_label: "A" },
      { ...figures[1], panel_label: "A" },
    ]).join(" "),
    /duplicate panel labels/,
  );
});

test("teacher caption and description corrections update Markdown and the index input", () => {
  const original = `${markdown}\n\nTeacher caption B`;
  const updated = figures.map((figure) =>
    figure.id === "figure-B"
      ? {
          ...figure,
          description: "Corrected panel B",
          caption: "Corrected caption B",
        }
      : figure,
  );
  const corrected = synchronizeFigureText(original, figures, updated);
  assert.match(corrected, /!\[Corrected panel B\]\(figures\/2\.png\)/);
  assert.match(corrected, /Corrected caption B/);
  assert.ok(!corrected.includes("Teacher caption B"));
  assert.deepEqual(validateFigureManifest(corrected, updated), []);
});

test("figure groups can contain images without printed panel labels", () => {
  assert.deepEqual(
    validateFigureManifest(
      markdown,
      figures.map((figure) => ({ ...figure, panel_label: "" })),
    ),
    [],
  );
  assert.deepEqual(
    validateFigureManifest(markdown, [
      figures[0],
      { ...figures[1], panel_label: "" },
    ]),
    [],
  );
});

test("a teacher-cleared caption is not restored by nearby text detection", () => {
  const reviewed = figures.map((figure) => ({
    ...figure,
    caption: "",
    caption_source: "teacher" as const,
  }));
  const withNearbyCaption = `${markdown}\n\nFigure 50.3. Original caption`;
  assert.deepEqual(
    buildDocumentIndex(withNearbyCaption, reviewed).figures.map(
      (figure) => figure.caption,
    ),
    ["", ""],
  );
  assert.deepEqual(validateFigureManifest(markdown, reviewed), []);
});
