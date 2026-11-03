import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChatbotPrompt,
  chatbotAllowance,
  DEFAULT_CHATBOT_CONFIG,
  DEFAULT_CHATBOT_PROMPT,
  validateChatbotConfig,
} from "../src/lib/chatbots/config";
import type { ChatbotConversation } from "../src/types/chatbot";

const config = {
  ...DEFAULT_CHATBOT_CONFIG,
  title: "Tutor",
};
const conversation = (sequence: number, turns = 0): ChatbotConversation => ({
  id: `conversation-${sequence}`,
  chatbot_id: "bot",
  student_id: "student",
  public_participant_id: null,
  language: null,
  is_preview: false,
  preview_owner_id: null,
  sequence,
  turns_used: turns,
  opening_complete: true,
  closed_at: null,
  pending_message_id: null,
  pending_until: null,
  created_at: "2026-11-03T00:00:00Z",
});

test("defaults match the teacher chatbot specification", () => {
  assert.equal(config.is_public, false);
  assert.equal(validateChatbotConfig({ ...config, is_public: true }).is_public, true);
  assert.equal(config.turn_limit, 20);
  assert.equal(config.max_conversations, 1);
  assert.equal(config.system_prompt, DEFAULT_CHATBOT_PROMPT);
  assert.equal(config.web_search, false);
  assert.equal(config.image_search, false);
});

test("prompt substitutes topic and locale label without recursively expanding teacher text", () => {
  const prompt = buildChatbotPrompt({
    ...config,
    title: "Literal {language}",
  });
  assert.match(prompt, /teaching the topic "Literal \{language\}" in the language English/);
  assert.equal(prompt, "You are an expert teacher. You are teaching the topic \"Literal {language}\" in the language English. Follow the best practices of conversational learning to help the student learn.");
  assert.equal(buildChatbotPrompt({ ...config, system_prompt: "Teacher's exact instructions.", web_search: true, image_search: false }), "Teacher's exact instructions.");
  assert.equal(buildChatbotPrompt({ ...config, system_prompt: "Teacher's exact instructions.", image_search: true }), "Teacher's exact instructions.\n\nAdd relevant images to explain the concept. Return only publicly accessible image URLs that can be loaded directly without signing in. Do not include broken or inaccessible image links.");
});

test("initial conversation counts once toward the total allowance", () => {
  const result = chatbotAllowance({ ...config, max_conversations: 2 }, [
    conversation(1, 4),
  ]);
  assert.equal(result.additionalConversationsRemaining, 1);
  assert.equal(result.turnsRemaining, 16);
  assert.equal(result.canRestart, true);
});

test("latest conversation determines allowance regardless of array ordering", () => {
  const result = chatbotAllowance({ ...config, max_conversations: 2 }, [
    conversation(2),
    conversation(1),
    conversation(3),
  ]);
  assert.equal(result.latest?.sequence, 3);
  assert.equal(result.additionalConversationsRemaining, 0);
  assert.equal(result.canRestart, false);
});

test("one, unlimited, and lowered limits have defined UI allowances", () => {
  assert.equal(chatbotAllowance(config, [conversation(1)]).canRestart, false);
  assert.equal(
    chatbotAllowance({ ...config, max_conversations: null }, [
      conversation(100),
    ]).additionalConversationsRemaining,
    null,
  );
  assert.equal(
    chatbotAllowance({ ...config, max_conversations: null }, [
      conversation(100),
    ]).canRestart,
    true,
  );
  assert.equal(
    chatbotAllowance(config, [conversation(3, 25)]).turnsRemaining,
    0,
  );
  assert.equal(
    chatbotAllowance(config, [conversation(3)])
      .additionalConversationsRemaining,
    0,
  );
});

test("invalid numeric values and malformed configuration are rejected", () => {
  assert.deepEqual(validateChatbotConfig(config), config);
  for (const turn_limit of [0, 1.5, NaN, 1001, "20"])
    assert.throws(() => validateChatbotConfig({ ...config, turn_limit }));
  for (const max_conversations of [0, -1, 1.5, NaN, 1002, "2"])
    assert.throws(() =>
      validateChatbotConfig({ ...config, max_conversations }),
    );
  assert.throws(() =>
    validateChatbotConfig({ ...config, language: "not-a-locale" }),
  );
  assert.throws(() => validateChatbotConfig({ ...config, title: " " }));
  assert.throws(() => validateChatbotConfig({ ...config, system_prompt: " " }));
  assert.equal(
    validateChatbotConfig({ ...config, max_conversations: null })
      .max_conversations,
    null,
  );
});

// Storage roles remain distinct from the shared presentation contract.
test("chatbot display adapter preserves attribution, delivery state, and storage role", async () => {
  const { chatbotDisplayMessage } = await import("../src/lib/chatbots/display");
  const message = {
    id: "message",
    conversation_id: "conversation",
    role: "user" as const,
    content: "**Hello**",
    status: "failed" as const,
    sources: [{ url: "https://example.org", title: "Source" }],
    search_entry_point: "<p>Search</p>",
    ai_invocation_id: null,
    created_at: "2026-11-03",
  };
  const display = chatbotDisplayMessage(message);
  assert.equal(display.role, "student");
  assert.equal(message.role, "user");
  assert.equal(display.deliveryStatus, "failed");
  assert.equal(display.format, "markdown");
  assert.deepEqual(display.sources, message.sources);
  assert.equal(display.searchAttributionHtml, undefined);
});

test("shared message presentation opts into Markdown while assessment defaults stay plain", async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ContentBox } =
    await import("../src/components/Shared/KonvoVoice/ContentBox");
  const message = {
    id: "message",
    role: "assistant" as const,
    content: "**Physics** ![diagram](https://example.org/diagram.png)",
    sources: [
      { url: "https://example.org", title: "Reference" },
      { url: "javascript:alert(1)", title: "Unsafe" },
    ],
    deliveryStatus: "failed" as const,
  };
  const render = (markdown: boolean) =>
    renderToStaticMarkup(
      React.createElement(ContentBox, {
        content: null,
        speechMode: "none",
        messages: [{ ...message, format: markdown ? "markdown" : undefined }],
      }),
    );
  const markdown = render(true);
  assert.match(markdown, /<strong>Physics<\/strong>/);
  assert.match(markdown, /<img[^>]+diagram.png/);
  assert.match(markdown, /Sources \(/);
  assert.match(markdown, /aria-expanded="false"/);
  assert.match(markdown, /Reply failed/);
  assert.doesNotMatch(markdown, /javascript:|>Unsafe</);
  assert.doesNotMatch(render(false), /<strong>Physics/);
  assert.match(render(false), /\*\*Physics\*\*/);
});

test("shared text input renders without a recorder or microphone control", async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { UserInputPanel } =
    await import("../src/components/Shared/KonvoVoice/UserInputPanel");
  const { getKonvoUiConfig } =
    await import("../src/components/Shared/KonvoVoice/uiState");
  const html = renderToStaticMarkup(
    React.createElement(UserInputPanel, {
      ui: getKonvoUiConfig("user_idle", false),
      audioEnabled: false,
      textEnabled: true,
      textValue: "Hello",
      onTextChange: () => {},
      onTextSubmit: () => {},
      canSubmitText: true,
      allowCopyPaste: true,
    }),
  );
  assert.match(html, /<textarea/);
  assert.match(html, /aria-label="Send"/);
  assert.doesNotMatch(html, /aria-label="Record"/);
});

test("conversation language respects teacher locks and validated student preferences", async () => {
  const { chatbotConversationLanguage } =
    await import("../src/lib/chatbots/config");
  assert.equal(chatbotConversationLanguage(config, "fr"), "en");
  assert.equal(
    chatbotConversationLanguage({ ...config, lock_language: false }, "fr"),
    "fr",
  );
  assert.equal(
    chatbotConversationLanguage({ ...config, lock_language: false }, "invalid"),
    "en",
  );
});

test("stream decoder handles split UTF-8, deltas, completion and failures", async () => {
  const { readChatbotStream } = await import("../src/lib/chatbots/stream");
  const makeResponse = (events: unknown[]) => {
    const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event)).join("\n") + "\n");
    return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
  };
  let text = "";
  await readChatbotStream(makeResponse([{ type: "delta", text: "Bonjour " }, { type: "delta", text: "\u00e9" }, { type: "done" }]), delta => { text += delta; });
  assert.equal(text, "Bonjour \u00e9");
  await assert.rejects(readChatbotStream(makeResponse([{ type: "delta", text: "partial" }]), () => {}), /interrupted/);
  await assert.rejects(readChatbotStream(makeResponse([{ type: "error", error: "Provider unavailable" }]), () => {}), /Provider unavailable/);
});

test("Wikimedia image thumbnails use supported sizes without rewriting other URLs", async () => {
  const { normalizeMarkdownImageUrl } = await import("../src/lib/markdownImageUrl");
  const base = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Brain.svg/";
  assert.equal(normalizeMarkdownImageUrl(base + "1024px-Brain.svg.png"), base + "1280px-Brain.svg.png");
  assert.equal(normalizeMarkdownImageUrl(base + "600px-Brain.svg.png"), base + "960px-Brain.svg.png");
  assert.equal(normalizeMarkdownImageUrl(base + "960px-Brain.svg.png"), base + "960px-Brain.svg.png");
  for (const url of ["https://example.com/thumb/1024px-image.png", "https://upload.wikimedia.org/wikipedia/commons/d/d4/Brain.svg", "javascript:alert(1)"]) assert.equal(normalizeMarkdownImageUrl(url), url);
});

test("Commons fallback resolves a filename without a guessed hash and rejects other hosts", async () => {
  const { wikimediaImageFallback } = await import("../src/lib/markdownImageUrl");
  const fallback = wikimediaImageFallback("https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Brain_lobes.svg/1024px-Brain_lobes.svg.png");
  assert.equal(fallback?.imageUrl, "https://commons.wikimedia.org/wiki/Special:Redirect/file/Brain_lobes.svg?width=960");
  assert.match(fallback!.searchUrl, /search=Brain%20lobes/);
  assert.equal(wikimediaImageFallback("https://example.com/wikipedia/commons/d/d4/Brain.svg"), null);
  assert.equal(wikimediaImageFallback("javascript:alert(1)"), null);
});

test("chat composer uses the shared text controls without assessment chrome", async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { UserInputPanel } = await import("../src/components/Shared/KonvoVoice/UserInputPanel");
  const { getKonvoUiConfig } = await import("../src/components/Shared/KonvoVoice/uiState");
  const props = { ui: getKonvoUiConfig("user_idle", false), audioEnabled: false, textEnabled: true, textValue: "Hello", onTextChange: () => {}, onTextSubmit: () => {}, canSubmitText: true, allowCopyPaste: true };
  const composer = renderToStaticMarkup(React.createElement(UserInputPanel, { ...props, variant: "composer" }));
  assert.match(composer, /<textarea/);
  assert.match(composer, /aria-label="Send"/);
  assert.doesNotMatch(composer, />You<|aria-label="Record"|absolute inset-0/);
  const disabled = renderToStaticMarkup(React.createElement(UserInputPanel, { ...props, variant: "composer", inputsDisabled: true }));
  assert.match(disabled, /<textarea[^>]*disabled/);
  assert.match(disabled, /<button[^>]*disabled/);
  const assessment = renderToStaticMarkup(React.createElement(UserInputPanel, props));
  assert.match(assessment, />You</);
});

test("shared pending reply indicator replaces the empty chat placeholder", async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ContentBox } = await import("../src/components/Shared/KonvoVoice/ContentBox");
  const thinking = renderToStaticMarkup(React.createElement(ContentBox, { content: null, messages: [], pendingReply: true, speechMode: "none" }));
  assert.match(thinking, /role="status"/);
  assert.match(thinking, /Thinking/);
  assert.doesNotMatch(thinking, /Enjoy learning/);
  const streaming = renderToStaticMarkup(React.createElement(ContentBox, { content: null, pendingReply: false, speechMode: "none", messages: [{ id: "reply", role: "assistant", content: "Hello", streaming: true }] }));
  assert.match(streaming, /Hello/);
  assert.doesNotMatch(streaming, /Thinking|Waiting for a reply/);
});

test("bot image URLs render SVGs while ordinary code and citations stay intact", async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: MarkdownContent } = await import("../src/components/Shared/MarkdownContent");
  const url = "https://upload.wikimedia.org/wikipedia/commons/5/5f/Simple_neuron_scheme.svg";
  const render = (content: string, enabled = true) => renderToStaticMarkup(React.createElement(MarkdownContent, { content, renderStandaloneImages: enabled }));
  for (const content of [url, "```text\n" + url + "\n```", "![Neuron](" + url + ")"]) {
    assert.match(render(content), /<img[^>]*src="https:\/\/upload.wikimedia.org/);
  }
  for (const content of ["```js\n" + url + "\n```", "```text\nSee " + url + "\n```", "[Source](" + url + ")", "https://commons.wikimedia.org/wiki/File:Neuron.svg", "javascript:alert(1)", "<svg onload=alert(1)></svg>"]) {
    assert.doesNotMatch(render(content), /<img|<svg/);
  }
  assert.doesNotMatch(render("```text\n" + url + "\n```", false), /<img/);
});
