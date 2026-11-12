-- QW-20261113-001: 店舗ごとの「固定枠」（この曜日のこの時間帯は公演を開ける／開けない）。
-- 公演スケジュールの下書き自動作成で、作品を入れる枠を決めるのに使う。
-- weekday: 0=日 1=月 … 6=土 7=祝日（祝日の行が無ければ、その日の曜日の行を使う）。
-- 行が無い枠は「未設定」＝下書きを作らない。
-- 閲覧は同じ組織のスタッフ、書き込みは同じ組織の管理者のみ（店舗の募集停止と同じ決まり）。

CREATE TABLE IF NOT EXISTS public.schedule_slot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 7),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  is_open boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_slot_rules_slot_key UNIQUE (organization_id, store_id, weekday, time_slot)
);

COMMENT ON TABLE public.schedule_slot_rules IS
  '店舗×曜日×時間帯の固定枠（開ける/開けない）。weekday 0=日…6=土、7=祝日。行なし=未設定。公演の下書き自動作成が使う';

ALTER TABLE public.schedule_slot_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.schedule_slot_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_slot_rules TO authenticated;

DROP POLICY IF EXISTS schedule_slot_rules_select_staff ON public.schedule_slot_rules;
DROP POLICY IF EXISTS schedule_slot_rules_insert_admin ON public.schedule_slot_rules;
DROP POLICY IF EXISTS schedule_slot_rules_update_admin ON public.schedule_slot_rules;
DROP POLICY IF EXISTS schedule_slot_rules_delete_admin ON public.schedule_slot_rules;

CREATE POLICY schedule_slot_rules_select_staff ON public.schedule_slot_rules
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY schedule_slot_rules_insert_admin ON public.schedule_slot_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.get_user_organization_id()
    AND store_id IN (SELECT s.id FROM public.stores s WHERE s.organization_id = public.get_user_organization_id())
  );

CREATE POLICY schedule_slot_rules_update_admin ON public.schedule_slot_rules
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND organization_id = public.get_user_organization_id())
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.get_user_organization_id()
    AND store_id IN (SELECT s.id FROM public.stores s WHERE s.organization_id = public.get_user_organization_id())
  );

CREATE POLICY schedule_slot_rules_delete_admin ON public.schedule_slot_rules
  FOR DELETE TO authenticated
  USING (public.is_admin() AND organization_id = public.get_user_organization_id());
