-- The AI retry work makes insertChatMessage upsert on the client-minted id so a
-- retried turn is idempotent (and a retried dual-STT turn can correct the
-- fallback transcript). chat_messages had only INSERT + SELECT policies, so the
-- ON CONFLICT DO UPDATE path was RLS-denied — a retry's upsert would error.
--
-- Mirror the existing chat_message_actions UPDATE policy (permissive for
-- authenticated + anon), matching this table's existing permissive INSERT/SELECT
-- model. See dev-docs/ai-retry-and-failure-recovery-plan.md §5/§11.

drop policy if exists "Allow public to update chat messages" on public.chat_messages;
create policy "Allow public to update chat messages"
  on public.chat_messages
  for update
  to authenticated, anon
  using (true)
  with check (true);
