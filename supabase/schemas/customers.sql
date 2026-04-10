-- 正規ソース: supabase/schemas/customers.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  phone TEXT,
  line_id TEXT,
  notes TEXT,
  visit_count INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  last_visit DATE,
  preferences TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  nickname VARCHAR,
  address TEXT,
  avatar_url TEXT,
  birth_date DATE,
  notification_settings JSONB DEFAULT '{"email_notifications": true, "campaign_notifications": true, "reminder_notifications": true}'::jsonb,
  prefecture TEXT
);

-- Indexes
CREATE INDEX idx_customers_email ON public.customers USING btree (email);
CREATE UNIQUE INDEX idx_customers_email_unique ON public.customers USING btree (email);
CREATE INDEX idx_customers_lower_email ON public.customers USING btree (lower(email));
CREATE INDEX idx_customers_organization_id ON public.customers USING btree (organization_id);
CREATE INDEX idx_customers_prefecture ON public.customers USING btree (prefecture);
