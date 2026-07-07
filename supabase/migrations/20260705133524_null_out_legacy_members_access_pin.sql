-- ====================================================================
-- #281/#283 対策 (members.access_pin 封鎖 ステップ2/2)
--
-- private_group_members.access_pin に残存する平文PIN(87件)をNULL化する。
-- これにより anon がテーブル直接SELECTで平文PINを読める経路を塞ぐ。
--
-- 安全弁: pii 側に同一値のPINが保全されている行のみを対象にする。
--         （万一保全されていない行があれば触らず、情報損失を防ぐ）
-- ステップ1でトリガーからaccess_pin同期を除外済みのため、この更新で
-- pii.access_pin が破壊されることはない。
--
-- 切り戻し: 値は pii 側に完全保全されているため、必要なら
--   UPDATE private_group_members m SET access_pin = p.access_pin
--   FROM private_group_members_pii p WHERE p.member_id = m.id;
--   で書き戻せる（ただし戻す理由はない）。
-- ====================================================================
UPDATE public.private_group_members m
SET access_pin = NULL
WHERE m.access_pin IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.private_group_members_pii p
    WHERE p.member_id = m.id
      AND p.access_pin = m.access_pin
  );