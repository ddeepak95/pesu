# Teacher-created chatbots

Teachers create class chatbots with title, language, system prompt, turn limit, conversation allowance, and web/image search permissions. The default prompt is:

> You are an expert teacher. You are teaching the topic "{topic_title}" in the language {language}. Follow the best practices of conversational learning to help the student learn.

## Editor and preview

- Title is the only name/topic field; `{topic_title}` resolves to the title. Class-group placement is inherited from navigation and is not shown in the editor.
- Conversation language is locked by default. Teachers can unlock it; students can then change language during an open conversation. Choices persist per conversation, and the server enforces current locks on changes and replies.
- Content and Settings tabs share the activity editor components, language selector, settings cards, and collapsible sections.
- Cancel, Save as Draft, Save and Preview, and Publish/Update replace the visibility dropdown.
- Save and Preview creates a draft once and then updates that same chatbot. Existing publication status is preserved when previewing.
- The shared full-screen preview offers Restart preview and Exit preview. Exiting retains editor state.
- Previews use saved settings and the class-scoped metered AI model. Each teacher owns their previews; other teachers, administrators, and students cannot read them.
- Preview turns obey the configured turn limit. Preview restarts have no conversation cap and never count toward student history, completion, or allowances.

## Conversations and presentation

- Keep `chatbot_conversations` and `chatbot_messages` separate from assessment storage. Map records into the shared message display type.
- Reuse ContentBox, UserInputPanel, BotStatusPanel, and error components. Chatbot messages support Markdown, returned image links, citations, search attribution, and pending/failed states.
- Chatbots use text-only inputs and do not initialize recording or speech hooks. Assessment rendering keeps its existing defaults.
- Each conversation has its own UUID, owner, sequence, turn count, and closed state. Starting another conversation closes the previous one and starts fresh context. Resuming preserves the same ID, sequence, and turn count.
- Default allowance is one total conversation per student; finite allowances are positive integers (up to 1001), or Unlimited. Default turn limit is 20; search defaults off.
- The new migration converts old `max_restarts` values to `max_conversations = max_restarts + 1`, retaining null for Unlimited. The original applied migration remains intact.
- Database transactions enforce allowances and turns atomically. Failed starts consume no allowance; failed replies preserve a failed message without consuming a turn. Teacher changes affect future admissions immediately and preserve transcripts.
- Chatbots remain disabled by default under existing institution/class content settings. Students may mark assigned content complete. Teachers/admins can review student transcripts.
- Models use the class `text.chat_tutoring` catalog binding and existing invocation logging. Provider-native search preserves attribution; image results are not guaranteed and unsupported tools report errors.
- Voice, grading, extra tools, and message-table consolidation are deferred.

## Validation

Automated checks: `npm run test:chatbots`, `npm run test:chatbots:db`, `npm run test:chatbots:concurrency`, TypeScript, and focused ESLint. Database tests use local Supabase only.

Manual browser checks (user-owned):

1. Enable Chatbot for the institution/class. Create a draft through Save and Preview, exit, edit, and preview again. Verify one chatbot/placement, retained form state, and publication/update actions.
2. Preview an existing published chatbot and verify it stays published. Restart previews and verify new IDs, preserved transcripts, and no student allowance/completion changes.
3. As a student, send messages, refresh, and resume. Try one, finite, and unlimited conversation allowances; start another before/after the turn cap, and lower limits while conversations exist.
4. Review transcripts as teacher/admin; verify students and other teachers cannot see someone else's preview. Duplicate and delete content.
5. Check Markdown, returned images, citations, attribution, provider failures, and unsupported enabled search tools.
6. Check existing multimodal activities, including recording, automatic/on-demand speech, and activity preview controls.

## Streaming and opening messages

New conversations automatically generate a brief welcome and an engaging first question, including teacher previews and restarts. Openings do not consume student turns. Failed openings can be retried in the same conversation, with no extra conversation allowance. Existing conversations retain their previous context.

Replies stream through the metered gateway. Only successfully completed replies enter trusted history; partial stream errors show a recoverable failure. The server saves admitted replies even if the client disconnects. Search sources and attribution are stored with the final reply. Students cannot send until the opening succeeds, and database leases prevent duplicate openings and concurrent replies.

The runtime system prompt is exactly the saved teacher prompt with `{topic_title}` and `{language}` substituted. When image search is enabled, append "Add relevant images to explain the concept. Return only publicly accessible image URLs that can be loaded directly without signing in. Do not include broken or inaccessible image links." No other language, search, or safety instructions are appended automatically. Language settings affect the `{language}` placeholder; tools are enabled through provider configuration.

Chatbot messages display source attribution links only. Provider search-suggestion HTML remains stored for review but is not passed to the chat display.

## Chat layout

Student chat and teacher preview use a full-width text composer pinned beneath an independently scrolling transcript. The separate Konvo avatar/status panel is omitted. Opening and reply generation show an inline Thinking indicator until streaming text arrives; language saves and other mutations do not trigger it. The transcript follows new content only while the reader is near its bottom. Previous conversations and exhausted allowances show a disabled composer with an explanation. Assessment input panels and read-only teacher transcript layouts retain their defaults.

## Public chatbot links

- In Settings, teachers can enable **Make chatbot public**. Defaults to off. Publish/Update saves this setting; drafts never accept public visitors.
- **Share links** on the teacher chatbot page reuses the activity sharing dialog. The public URL is `/chatbot/{chatbot_id}`; the classroom URL still requires enrollment and content access.
- Public visitors enter their name through the existing responder form, then use the same text/streaming chat interface, tools, language controls, and limits. Calls are metered against the owning class.
- Public identity is separate from student accounts: `chatbot_public_participants` and `chatbot_conversations.public_participant_id`. A random HttpOnly cookie authenticates each browser session; only its hash is stored. Credentials are never returned to clients or teachers.
- Public allowances and history persist in that browser for up to one year. They cannot enforce a per-person limit across cleared cookies or different browsers. Public visitors do not affect classroom completion or student allowances.
- Teachers/admins can review named public transcripts. Visitors can read only their own conversations, through server routes. Preview sessions remain teacher-only.
- Turning public access off, unpublishing/deleting the chatbot, or disabling the class blocks subsequent public reads and admissions. Already admitted replies may finish saving.
- Migration: `20261103040000_public_chatbots.sql`. Apply via Supabase CLI. Existing conversations are unchanged.

Automated checks: `npm run test:chatbots:db`, `npm run test:chatbots:concurrency`, and `npm run test:chatbots:public-api` (requires the local app at `http://localhost:3000` using local Supabase; makes no AI calls).
