import { test } from "node:test";
import assert from "node:assert/strict";
import { extractChatbotImages, validateImageMatches } from "../src/lib/chatbots/imageMatching";
import { computeUsage } from "../src/lib/ai/metering/computeUsage";
import { createDefaultLocalAiSettings } from "../src/lib/ai/catalog/defaults";
import { CATALOG_FUNCTIONS, CATALOG_MODELS } from "../src/lib/ai/catalog/data";
import { modelSupportsTasks, resolveFunctionBinding } from "../src/lib/ai/catalog/helpers";
import { settingCapabilities } from "../src/lib/settings/capabilities";
import { SETTINGS_REGISTRY } from "../src/lib/settings/registry";
import type { ChatbotImage } from "../src/types/chatbot";

const library: ChatbotImage[] = [{ id: "upload1", chatbot_id: "bot", filename: "neuron.png", description: "A labelled neuron", status: "ready" }];
test("image extraction handles repeated URLs, references and standalone images in display order", () => {
  const content = "Neuron\n\n![A](https://example.org/a.png) and ![B](https://example.org/a.png)\n\n![C][diagram]\n\n[diagram]: https://example.org/c.png\n\n```text\nhttps://example.org/d.svg\n```\n\n[Source](https://example.org/e.png)\n\n`![code](https://example.org/no.png)`";
  const images = extractChatbotImages(content);
  assert.equal(images.length, 4);
  assert.deepEqual(images.map(i => i.id), ["image_0", "image_1", "image_2", "image_3"]);
  assert.match(images[0].context, /Neuron/);
  assert.equal(images[3].url, "https://example.org/d.svg");
});
test("matches accept only unique valid choices from this library", () => {
  const occurrences = extractChatbotImages("![A](https://example.org/a.png) ![B](https://example.org/b.png)");
  const matched = validateImageMatches([{ type: "choice", name: "image_0", choice: "upload1" }, { type: "refusal", name: "image_1" }], occurrences, library, "replace");
  assert.deepEqual(matched, [{ occurrence_id: "image_0", original_url: occurrences[0].url, image_id: "upload1", action: "replace", description: "A labelled neuron" }]);
  for (const choice of ["none", "another-chatbot-image", null]) {
    assert.deepEqual(validateImageMatches([{ type: "choice", name: "image_0", choice }], occurrences, library, "append"), []);
  }
  assert.deepEqual(validateImageMatches(null, occurrences, library, "replace"), []);
  const duplicate = { type: "choice", name: "image_0", choice: "upload1" };
  assert.deepEqual(validateImageMatches([duplicate, duplicate], occurrences, library, "replace"), []);
  assert.deepEqual(validateImageMatches([duplicate], occurrences, [{ ...library[0], status: "removed" }], "replace"), []);
});
test("rendering replaces only selected occurrences, supports append and defers streaming images", async () => {
  const React = await import("react"); Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: MarkdownContent } = await import("../src/components/Shared/MarkdownContent");
  const content = "Text\n\n![A](https://example.org/a.png)\n\n![B](https://example.org/a.png)";
  const mappings = validateImageMatches([{ type: "choice", name: "image_0", choice: "upload1" }], extractChatbotImages(content), library, "replace");
  const render = (extra = {}) => renderToStaticMarkup(React.createElement(MarkdownContent, { content, renderStandaloneImages: true, messageId: "reply", imageMappings: mappings, ...extra }));
  assert.equal((render().match(/<img/g) ?? []).length, 2);
  assert.match(render(), /src="\/api\/chatbots\/images\/upload1\?messageId=reply"/);
  assert.match(render({ showOriginalImages: true }), /Original image/);
  assert.equal((render({ imageMappings: [{ ...mappings[0], action: "append" }] }).match(/<img/g) ?? []).length, 3);
  assert.doesNotMatch(render({ deferImages: true }), /<img/);
  assert.match(render({ deferImages: true }), /Text/);
});
test("Decisions has independent filtering, bindings and endpoint rates", () => {
  const fn = CATALOG_FUNCTIONS.find(f => f.key === "decisions")!;
  assert.deepEqual(CATALOG_MODELS.filter(m => modelSupportsTasks(m, fn.requiredTasks)).map(m => m.id), ["gpt-6-luna-decisions"]);
  const choice = { providerId: "openai" as const, modelId: "gpt-6-luna-decisions" };
  assert.deepEqual(resolveFunctionBinding({ ...createDefaultLocalAiSettings("class"), functions: { decisions: choice } }, "decisions", "chatbot_image_matching"), choice);
  const metrics = { inputTokens: 1_000_000, outputTokens: 100_000 };
  const result = computeUsage({ catalogModelId: choice.modelId, usageType: "decisions", metrics });
  assert.equal(result.costUsd, 0.1);
  assert.equal(result.missingRate, false);
  const cached = computeUsage({ catalogModelId: choice.modelId, usageType: "decisions", metrics: { ...metrics, tokenDetails: { cachedInputTokens: 500_000 } } });
  assert.ok(Math.abs(cached.costUsd! - 0.055) < 1e-9);
  assert.equal(computeUsage({ catalogModelId: "gpt-6-luna", usageType: "text_generation", metrics }).costUsd, 0.15);
});
test("only institution and platform admins may enable the class feature", () => {
  for (const viewerRole of ["class_owner", "class_teacher_admin", "class_teacher_co_owner", "class_co_teacher", "viewer", "institution_admin", "super_admin"] as const) {
    const caps = settingCapabilities({ viewerRole, definition: SETTINGS_REGISTRY.allow_chatbot_images, institutionLocks: { allowAdminEdit: false, allowChildOverride: true } });
    assert.equal(caps.canEditClassOverride, ["institution_admin", "super_admin"].includes(viewerRole));
  }
  assert.equal(SETTINGS_REGISTRY.allow_chatbot_images.default, false);
});


test("Decisions transport preserves partial refusals and does not retry provider failures", async () => {
  const { requestDecisions } = await import("../src/lib/ai/gateway/decisionsTransport");
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/decisions");
      assert.ok(options?.signal);
      const body = JSON.parse(options!.body as string);
      assert.equal(body.model, "gpt-6-luna");
      return Response.json({ answers: [{ type: "refusal", name: "image_0" }, { type: "choice", name: "image_1", choice: "upload1" }], usage: { input_tokens: 123 } }, { headers: { "x-request-id": "request-1" } });
    };
    const { result, requestId } = await requestDecisions("test-key", { model: "gpt-6-luna" }, 1000);
    assert.equal(requestId, "request-1");
    assert.equal(result.answers.length, 2);
    globalThis.fetch = async () => { calls++; return new Response("Unavailable", { status: 503 }); };
    await assert.rejects(requestDecisions("test-key", {}, 1000), /503/);
    assert.equal(calls, 2, "Failure makes only one request");
    await assert.rejects(requestDecisions("test-key", {}, 0), /timed out/);
    assert.equal(calls, 2, "Expired budget makes no request");
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason));
    });
    // Keep the event loop alive while AbortSignal's unref'ed timer fires.
    const keepAlive = setTimeout(() => {}, 100);
    try { await assert.rejects(requestDecisions("test-key", {}, 5), /timeout|timed out/i); }
    finally { clearTimeout(keepAlive); }
  } finally { globalThis.fetch = original; }
});


test("uploads decode only supported still-image formats and reject spoofed or oversized files", async () => {
  const { default: sharp } = await import("sharp");
  const { validateChatbotImageUpload, CHATBOT_IMAGE_MAX_BYTES } = await import("../src/lib/chatbots/imageUploadValidation");
  for (const format of ["png", "jpeg", "webp"] as const) {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).toFormat(format).toBuffer();
    const validated = await validateChatbotImageUpload(image, `image/${format}`);
    assert.equal((await sharp(validated).metadata()).format, format);
    await assert.rejects(validateChatbotImageUpload(image, format === "png" ? "image/jpeg" : "image/png"), /still PNG/);
  }
  await assert.rejects(validateChatbotImageUpload(Buffer.from("<svg></svg>"), "image/svg+xml"), /Choose a PNG/);
  await assert.rejects(validateChatbotImageUpload(Buffer.from("not an image"), "image/png"));
  await assert.rejects(validateChatbotImageUpload(Buffer.alloc(CHATBOT_IMAGE_MAX_BYTES + 1), "image/png"), /10 MB/);
});
