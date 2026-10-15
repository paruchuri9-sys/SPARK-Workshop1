CREATE TABLE spark_events (
 id UUID PRIMARY KEY,
 session_id UUID NOT NULL,
 event_type TEXT NOT NULL CHECK (event_type IN ('session_started','opportunities_generated','moments_selected','activity_generated','teacher_feedback','api_error')),
 design_version TEXT NOT NULL,
 reasoner_version TEXT NOT NULL,
 build_id TEXT NOT NULL,
 lesson_id TEXT,
 payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX spark_events_session_idx ON spark_events (session_id,created_at);
CREATE INDEX spark_events_type_idx ON spark_events (event_type,created_at);
