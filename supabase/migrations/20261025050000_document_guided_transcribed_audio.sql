-- Retrieval runs before the tutor response, so this template needs text for the
-- learner's latest utterance. Other templates retain their audio delivery mode.
update public.activity_templates
set definition = jsonb_set(definition, '{defaults,multimodal,interactionConfig}',
    '{"input":{"audioDelivery":"transcribe"}}'::jsonb, true),
    updated_at = now()
where id = '11111111-1111-4111-8111-000000000005';
