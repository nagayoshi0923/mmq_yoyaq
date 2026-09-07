ALTER TABLE public.performance_recruitment_policies ADD COLUMN x_enabled boolean NOT NULL DEFAULT false, ADD COLUMN x_username text;
CREATE TABLE public.recruitment_x_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), schedule_event_id uuid NOT NULL REFERENCES schedule_events(id),
 cycle integer NOT NULL, kind text NOT NULL CHECK(kind IN ('extension','confirmed','cancelled')), snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','expired')),
 tweet_id text, post_text text, attempts integer NOT NULL DEFAULT 0, first_failed_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_event_id,cycle,kind)
);
ALTER TABLE public.recruitment_x_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_x_posts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.recruitment_x_posts TO service_role;
