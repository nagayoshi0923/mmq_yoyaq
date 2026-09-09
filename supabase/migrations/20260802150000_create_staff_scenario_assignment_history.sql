-- スタッフ⇔シナリオ担当の変更履歴（YOYAQ-011）
--
-- 背景:
-- ・staff_scenario_assignments には assigned_at しか無く、いつ誰が何を外したかを事後に追えなかった。
--   部分的に欠けた配列での保存で担当が黙って消えても痕跡が残らないため、監査できる履歴を新設する。
-- ・本体（staff_scenario_assignments）の delete/insert 差分のうち「実際に増減した分だけ」を記録する。
--   action='added'  … その保存で新規に担当（結合行）が増えた scenario_master_id
--   action='removed'… その保存で担当（結合行）が消えた scenario_master_id
-- ・書き込み・参照はすべて api/assignments.ts の service_role 経由でのみ行う。
--   クライアント（anon / authenticated）から直接読み書きする経路は無い。
--
-- 権限:
-- ・anon には一切 GRANT しない（2026-08-02 以降、新規テーブルは明示 GRANT 必須の運用。
--   既定権限も 20260802140000 で anon/authenticated への自動付与を廃止済み）。
-- ・authenticated にも GRANT しない（API の service_role からのみ触る）。
-- ・多層防御として明示 REVOKE も入れる。

CREATE TABLE public.staff_scenario_assignment_history (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id),
  staff_id           uuid        NOT NULL REFERENCES public.staff(id),
  scenario_master_id uuid        NOT NULL REFERENCES public.scenario_masters(id),
  action             text        NOT NULL CHECK (action IN ('added', 'removed')),
  changed_by         uuid,
  changed_at         timestamptz NOT NULL DEFAULT now(),
  source             text        NOT NULL DEFAULT 'api'
);

COMMENT ON TABLE public.staff_scenario_assignment_history IS
  'スタッフ⇔シナリオ担当の変更履歴。staff_scenario_assignments の増減差分だけを記録（監査用・表示用）。API(service_role)からのみ書き込み';
COMMENT ON COLUMN public.staff_scenario_assignment_history.action IS
  '''added''=その保存で担当行が増えた / ''removed''=担当行が消えた';
COMMENT ON COLUMN public.staff_scenario_assignment_history.changed_by IS
  '変更を行った auth user id（API が JWT から解決）。FK は張らない（users に居ない主体もあり得るため記録のみ）';
COMMENT ON COLUMN public.staff_scenario_assignment_history.source IS
  '変更経路。既定 ''api''（/api/assignments 経由）';

-- スタッフ詳細で直近履歴を引くためのインデックス（新しい順）
CREATE INDEX idx_ssa_history_staff_changed_at
  ON public.staff_scenario_assignment_history (staff_id, changed_at DESC);
CREATE INDEX idx_ssa_history_org
  ON public.staff_scenario_assignment_history (organization_id);

ALTER TABLE public.staff_scenario_assignment_history ENABLE ROW LEVEL SECURITY;
-- ポリシーは作らない = anon/authenticated からは RLS で全拒否。service_role は RLS をバイパスする。

-- 最小権限: anon / authenticated には一切 GRANT しない（明示 REVOKE で多層防御）。
REVOKE ALL ON public.staff_scenario_assignment_history FROM anon;
REVOKE ALL ON public.staff_scenario_assignment_history FROM authenticated;
