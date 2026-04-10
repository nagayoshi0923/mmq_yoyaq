-- 正規ソース: supabase/schemas/private_group_members.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.private_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.private_groups(id),
  user_id UUID,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  is_organizer BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_amount INTEGER,
  coupon_id UUID,
  coupon_discount INTEGER DEFAULT 0,
  final_amount INTEGER,
  payment_status TEXT DEFAULT 'pending'::text,
  access_pin TEXT
);

-- Indexes
CREATE INDEX idx_private_group_members_coupon_id ON public.private_group_members USING btree (coupon_id);
CREATE INDEX idx_private_group_members_group_id ON public.private_group_members USING btree (group_id);
CREATE INDEX idx_private_group_members_payment_status ON public.private_group_members USING btree (payment_status);
CREATE INDEX idx_private_group_members_user_id ON public.private_group_members USING btree (user_id);
