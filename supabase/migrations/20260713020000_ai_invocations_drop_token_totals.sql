-- AI usage metering — drop redundant blended-token columns (dev-docs/ai-usage-metering-plan.md §4.1)
-- prompt_tokens/completion_tokens/total_tokens were the pre-metering blended
-- totals. Now that token_details stores a full disaggregated breakdown
-- (textInputTokens/cachedInputTokens/audioInputTokens/imageInputTokens sum to
-- the old prompt_tokens; textOutputTokens/reasoningTokens sum to the old
-- completion_tokens), these columns are pure duplicate data — reconstructible
-- from token_details, never read back by computeUsage (which is fed the raw
-- in-memory SDK usage at write time, not these columns).

alter table public.ai_invocations
  drop column if exists prompt_tokens,
  drop column if exists completion_tokens,
  drop column if exists total_tokens;
