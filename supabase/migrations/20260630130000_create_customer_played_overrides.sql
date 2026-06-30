-- 体験済みシナリオの「除外オーバーライド」: ユーザー自身（とスタッフ）が、予約由来で自動付与された
-- 体験済みを「未体験（表示しない）」に解除できるようにする永続レコード。
--
-- 背景:
-- ・体験済み = reservations(過去・非cancelled/no_show) ∪ manual_play_history で自動判定される。
--   自動付与は維持が正（毎回手動付与は大変）。ただし代理予約・不参加などで予約者≠プレイヤーのズレが出る。
-- ・従来マイページの「アルバムから非表示」は localStorage 実装＝端末ローカルのみ・予約サイトに非反映だった。
--   これを DB に昇格し、予約サイト/シナリオ詳細/マイページ/他端末すべてに一貫反映する。
-- ・override は scenario_master_id 単位（予約サイトの体験済み Set と整合）。行が在る=その顧客はそのシナリオ未体験扱い。
-- ・集計（売上/給与/キット/顧客台帳の来店・遅刻・欠席）は予約を直読みするため override の影響を受けない（表示判定専用）。
-- ・RLS は manual_play_history と同じ「本人 or スタッフ」。platform 顧客（org 横断）なので organization_id は持たない。
-- ・created_by は customers が public.users に居ない場合があるため FK を張らず DEFAULT auth.uid() で記録のみ。

CREATE TABLE public.customer_played_overrides (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid        NOT NULL REFERENCES public.customers(id)        ON DELETE CASCADE,
  scenario_master_id uuid        NOT NULL REFERENCES public.scenario_masters(id) ON DELETE CASCADE,
  reason             text,
  created_by         uuid        DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, scenario_master_id)
);

COMMENT ON TABLE public.customer_played_overrides IS
  '体験済みの除外オーバーライド。行が在る=(customer_id, scenario_master_id)を未体験扱い。本人/スタッフが操作、表示判定専用（集計に影響しない）';

CREATE INDEX idx_customer_played_overrides_customer ON public.customer_played_overrides(customer_id);

ALTER TABLE public.customer_played_overrides ENABLE ROW LEVEL SECURITY;

-- RLS: 顧客自身（自分の customers 行）または スタッフ。manual_play_history と同パターン。
CREATE POLICY "played_overrides_select" ON public.customer_played_overrides
  FOR SELECT
  USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "played_overrides_insert" ON public.customer_played_overrides
  FOR INSERT
  WITH CHECK (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "played_overrides_delete" ON public.customer_played_overrides
  FOR DELETE
  USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid())
  );

-- ログイン済みユーザーのみ。匿名（未ログインの予約サイト）は体験済み判定自体を行わないため不要＝多層防御で剥がす。
GRANT SELECT, INSERT, DELETE ON public.customer_played_overrides TO authenticated;
REVOKE ALL ON public.customer_played_overrides FROM anon;
-- UPDATE は使わない（行は insert で除外・delete で解除のみ）。Supabase 既定で authenticated に付く UPDATE を剥がす
-- （UPDATE ポリシーが無いので RLS でも拒否されるが、least-privilege のため明示）。
REVOKE UPDATE ON public.customer_played_overrides FROM authenticated;
-- prod の既定権限は authenticated に TRUNCATE/TRIGGER/REFERENCES まで付与する（staging との環境差）。
-- API 経路は無く RLS も効くが、最小権限のため DML 以外を明示的に剥がす。
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.customer_played_overrides FROM authenticated;
