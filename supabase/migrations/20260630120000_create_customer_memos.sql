-- 予約台帳化 Step4（DB）: 顧客単位・社内専用メモ customer_memos
--
-- ・顧客に「絶対に」見せない社内メモ。customers にカラムを足すと RLS は列単位で隠せず、
--   顧客が自分の customers 行を読める＝メモが漏れる。→ 別テーブルにして RLS で
--   「組織スタッフのみ」許可し、顧客ロール(role='customer')には policy を一切作らない＝全拒否。
-- ・メモは (customer_id, organization_id) 単位で1件（同一顧客は別予約でも同じメモ）。Step5 で upsert する。
-- ・組織横断 customer（customers.organization_id が NULL の platform 顧客。[[project_platform_customer_model]]）
--   でも、メモは「メモを書いた組織」の organization_id で分離する。

CREATE TABLE public.customer_memos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid        NOT NULL REFERENCES public.customers(id)     ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  memo            text        NOT NULL DEFAULT '',
  created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, organization_id)
);

COMMENT ON TABLE public.customer_memos IS '顧客単位の社内専用メモ。RLSで組織スタッフのみ・顧客ロールには一切見せない。(customer_id, organization_id) で1件';

-- updated_at 自動更新（既存の共通トリガー関数を再利用）
CREATE TRIGGER trg_customer_memos_updated_at
  BEFORE UPDATE ON public.customer_memos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- RLS: 自組織 かつ 組織スタッフ(admin/staff/license_admin) のみ。
--      顧客ロール・匿名は is_staff_or_admin()=false で全拒否（policy も付けない）。
-- =====================
ALTER TABLE public.customer_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_memos_select_staff" ON public.customer_memos
  FOR SELECT
  USING (organization_id = get_user_organization_id() AND is_staff_or_admin());

CREATE POLICY "customer_memos_insert_staff" ON public.customer_memos
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() AND is_staff_or_admin());

CREATE POLICY "customer_memos_update_staff" ON public.customer_memos
  FOR UPDATE
  USING (organization_id = get_user_organization_id() AND is_staff_or_admin())
  WITH CHECK (organization_id = get_user_organization_id() AND is_staff_or_admin());

CREATE POLICY "customer_memos_delete_staff" ON public.customer_memos
  FOR DELETE
  USING (organization_id = get_user_organization_id() AND is_staff_or_admin());

-- アクセス権限。authenticated には付与するが、顧客ロールは上記 RLS で弾かれる。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_memos TO authenticated;
-- anon（顧客予約サイト=匿名）は明示 REVOKE。Supabase の public スキーマ既定権限で
-- 新規テーブルが anon にも付与されるため、社内専用テーブルでは多層防御として剥がす
-- （RLS でも全拒否だが、万一 RLS 無効化時の保険）。
REVOKE ALL ON public.customer_memos FROM anon;
