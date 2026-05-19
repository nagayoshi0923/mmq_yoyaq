-- =============================================================================
-- OrgSignup (/start) フロー復旧: handle_new_user トリガー再作成 + staff.user_id UNIQUE
-- =============================================================================
-- 背景:
--   2026-05-18 セッションで /start からの組織自己登録が CompleteProfile に詰む
--   バグが判明。原因は 2 段重ね:
--
--   ① staging DB では `on_auth_user_created` トリガーが何らかの理由で消失しており、
--      auth.users INSERT 時に public.users / public.staff が一切作られない。
--      （関数 handle_new_user は存在するが、トリガー登録のみ消えている状態）
--      本番では現時点でトリガー登録は生きているが、誰も /start を試していないだけ。
--
--   ② handle_new_user 内の staff INSERT が `ON CONFLICT (user_id) DO NOTHING` を
--      使っているが、staff テーブルに user_id の UNIQUE 制約が無く
--      "no unique or exclusion constraint matching the ON CONFLICT specification"
--      で必ず失敗する。トリガーの EXCEPTION WHEN OTHERS に飲まれ silent fail し、
--      public.users INSERT までロールバックされる。
--
-- 修正内容:
--   1. staff.user_id に UNIQUE インデックスを追加（NULL 多重登録は許容）
--   2. on_auth_user_created トリガーを再作成（既に存在していても安全）
--
-- 既存データへの影響:
--   - staging / 本番ともに staff.user_id の非 NULL 重複は 0 件確認済み（適用可能）
--   - NULL user_id の staff 行（unregistered staff）は UNIQUE 配下でも複数可
-- =============================================================================

-- 1. staff.user_id に UNIQUE インデックスを追加
--    ON CONFLICT (user_id) のターゲットとして機能させるため。
--    UNIQUE INDEX は ON CONFLICT 推論で UNIQUE CONSTRAINT と同じく利用可能。
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_id_unique
  ON public.staff(user_id);

-- 2. on_auth_user_created トリガーを再作成（idempotent）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 完了通知
DO $$
BEGIN
  RAISE NOTICE '✅ staff.user_id に UNIQUE INDEX を作成しました';
  RAISE NOTICE '✅ on_auth_user_created トリガーを再作成しました';
  RAISE NOTICE '   - /start 組織自己登録フローでの users / staff 自動作成が復旧';
END $$;
