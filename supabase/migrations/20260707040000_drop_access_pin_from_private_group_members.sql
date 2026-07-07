-- ====================================================================
-- #281 [Critical] anon からの PIN 直接SELECT を封鎖
--   private_group_members.access_pin を DROP する
-- ====================================================================
-- 背景:
--   private_group_members は anon に対して RLS USING(true) + GRANT SELECT
--   のため、anon が access_pin / guest_email / guest_phone を直接 SELECT
--   できる状態が継続している（本番で平文PIN 87件が読める＝認証バイパス）。
--
--   列単位の REVOKE / 再GRANT は、フロントの PostgREST 埋め込み取得
--   （members:private_group_members (*) 等）を "permission denied for table"
--   で壊すため採用不可（2026-07-05 の staging 検証で確認済み）。
--   → 列を "DROP" すれば埋め込みは壊れず（列が消えるだけ）、anon から
--     確実に読めなくなる。
--
-- 前提（#320 で復元済みの2026-07-05マイグレーション）:
--   - stop_syncing_access_pin_in_pii_trigger: sync_private_group_member_pii
--     から access_pin を既に除去済み（本PRでの再定義は不要）
--   - null_out_legacy_members_access_pin: pii側に同値保全済みの
--     members.access_pin は既にNULL化済み
--   - hash_guest_access_pins_bcrypt: pii.access_pin は bcryptハッシュ化され
--     以後 pii にも平文PINは一切書き込まれない設計（access_pin_hash に一元化）
--   本PRのバックフィルは、この「pii には平文PINを書かない」という不変条件を
--   崩さないよう、ハッシュ化ルートに合わせて実装する。
--
-- このマイグレーションのスコープ:
--   access_pin は完全に vestigial（フロントは save_guest_access_pin /
--   authenticate_guest_by_pin RPC 経由で private_group_members_pii のみを
--   読み書きしており、members.access_pin を読む/書くコードは存在しない）。
--   よって members.access_pin を DROP しても機能影響はなく、認証バイパスの
--   本丸（平文PINの anon 直読）を安全に封鎖できる。
--
--   guest_email / guest_phone は別対応（本文参照）。招待ページの主催者予約
--   フォーム事前入力・スタッフ画面（アンケート/配布/履歴）・check_member_exists
--   RPC・joinGroup の書き込みが members 側の列に依存しているため、pii 集約＋
--   staff判定RPC への置換を伴う調整が必要で、実データでの動作確認が必須。
--   #284 と統合して別PRで実施する。
-- ====================================================================

-- ============================================================
-- 1. 残存PIN（pii未保全分）を pii 側へハッシュ化して退避
--    - pii 行が無いメンバーは行ごと backfill
--    - pii.access_pin_hash が未設定の場合のみ members 側の値をハッシュ化して埋める
--      （save_guest_access_pin / 7/5のハッシュ化migrationが設定した既存の
--       access_pin_hash は上書きしない。pii.access_pin には平文を書かない）
-- ============================================================
INSERT INTO public.private_group_members_pii (member_id, guest_name, guest_email, guest_phone, access_pin_hash, updated_at)
SELECT m.id, m.guest_name, m.guest_email, m.guest_phone,
       CASE WHEN m.access_pin IS NOT NULL THEN extensions.crypt(m.access_pin, extensions.gen_salt('bf')) END,
       NOW()
FROM public.private_group_members m
LEFT JOIN public.private_group_members_pii pii ON pii.member_id = m.id
WHERE pii.member_id IS NULL
  AND (m.guest_name IS NOT NULL
    OR m.guest_email IS NOT NULL
    OR m.guest_phone IS NOT NULL
    OR m.access_pin IS NOT NULL);

UPDATE public.private_group_members_pii pii
SET access_pin_hash = extensions.crypt(m.access_pin, extensions.gen_salt('bf')),
    updated_at = NOW()
FROM public.private_group_members m
WHERE pii.member_id = m.id
  AND m.access_pin IS NOT NULL
  AND pii.access_pin_hash IS NULL;

-- ============================================================
-- 2. access_pin 列を DROP
--    private_group_members_full ビューは pii.access_pin(_hash) を参照しており
--    members 側を参照していないため影響なし。
--    sync_private_group_member_pii は #320 復元分（20260705133500）で
--    既に access_pin を同期対象から除外済みのため、本PRでの再定義は不要。
-- ============================================================
ALTER TABLE public.private_group_members DROP COLUMN IF EXISTS access_pin;

-- ============================================================
-- 3. 完了通知 ＋ 検証SQL
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ #281: private_group_members.access_pin を DROP しました';
  RAISE NOTICE '  - pii未保全の残存PINは access_pin_hash へハッシュ化して退避済み';
  RAISE NOTICE '';
  RAISE NOTICE '検証（anon が access_pin を SELECT できないこと）:';
  RAISE NOTICE '  SET ROLE anon;';
  RAISE NOTICE '  SELECT has_column_privilege(''anon'', ''private_group_members'', ''access_pin'', ''SELECT'');';
  RAISE NOTICE '    -> 列が存在しないためエラー（= 読めない）';
  RAISE NOTICE '  RESET ROLE;';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ guest_email / guest_phone の anon 露出は本PRでは未対応（#284 と統合して別対応）';
END $$;
