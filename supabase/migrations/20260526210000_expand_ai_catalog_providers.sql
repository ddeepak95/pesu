-- Align DB provider allowlist with app catalog (google, openai, cartesia, sarvam).

alter table public.ai_provider_activations
  drop constraint if exists ai_provider_activations_provider_check;

alter table public.ai_provider_activations
  add constraint ai_provider_activations_provider_check
  check (
    provider_id = any (
      array['google'::text, 'openai'::text, 'cartesia'::text, 'sarvam'::text]
    )
  );

alter table public.ai_function_bindings
  drop constraint if exists ai_function_bindings_provider_check;

alter table public.ai_function_bindings
  add constraint ai_function_bindings_provider_check
  check (
    provider_id = any (
      array['google'::text, 'openai'::text, 'cartesia'::text, 'sarvam'::text]
    )
  );
