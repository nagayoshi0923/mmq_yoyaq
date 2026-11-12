-- 正規ソース: supabase/schemas/schedule_slot_rules.sql
-- 店舗×曜日×時間帯の固定枠（QW-20261113-001、migration 20261113100000）
-- weekday: 0=日 1=月 … 6=土 7=祝日（祝日の行が無ければ、その日の曜日の行を使う）。行なし=未設定。
-- 閲覧は同じ組織のスタッフ、書き込みは同じ組織の管理者のみ（RLS）。
CREATE TABLE public.schedule_slot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 7),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  is_open boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_id, weekday, time_slot)
);
