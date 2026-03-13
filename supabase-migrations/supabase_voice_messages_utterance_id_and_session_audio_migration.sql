-- Add utterance_id to voice_messages for ID-based transcript/audio correlation
ALTER TABLE voice_messages ADD COLUMN IF NOT EXISTS utterance_id text;
CREATE INDEX IF NOT EXISTS voice_messages_utterance_id_idx ON voice_messages (utterance_id);
COMMENT ON COLUMN voice_messages.utterance_id IS 'Stable ID for correlating transcript and audio (e.g. submission:question:attempt:role:ordinal)';

-- Table for whole-session composite audio (chunked, 60-second chunks)
CREATE TABLE IF NOT EXISTS submission_session_audio (
    submission_id text NOT NULL,
    question_order int NOT NULL,
    attempt_number int NOT NULL,
    composite_audio_chunk_urls text[] DEFAULT '{}',
    PRIMARY KEY (submission_id, question_order, attempt_number)
);
COMMENT ON TABLE submission_session_audio IS 'Session-level composite audio stored as chunk URLs (one WAV per ~60s); frontend plays in order';
