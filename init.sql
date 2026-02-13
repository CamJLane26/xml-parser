-- public.toys table
CREATE TABLE IF NOT EXISTS public.toys (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT NOT NULL,
    uuid TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT toys_uuid_unique UNIQUE (uuid)
);
