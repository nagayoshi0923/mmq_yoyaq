-- #281 / #283: 既存の平文 access_pin を secrets へ bcrypt ハッシュで一括移行し、平文を NULL 化する。
--
-- 冪等性:
--   - INSERT は ON CONFLICT DO NOTHING で、既に secrets がある member はスキップ。
--   - UPDATE は secrets にハッシュが存在する行のみ NULL 化。
--   本 migration を複数回流しても安全。
--
-- 補足:
--   仮に移行を取りこぼした member がいても、authenticate_guest_by_pin の
--   フォールバック（旧平文照合→自動移行）で救済されるため、既存ゲストは締め出されない。

-- 平文 PIN を secrets へハッシュ移行
INSERT INTO public.private_group_member_secrets (member_id, access_pin_hash, updated_at)
SELECT id, crypt(access_pin, gen_salt('bf')), now()
FROM public.private_group_members
WHERE access_pin IS NOT NULL
ON CONFLICT (member_id) DO NOTHING;

-- 移行済みの平文を消去（露出防止）
UPDATE public.private_group_members m
SET access_pin = NULL
WHERE m.access_pin IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.private_group_member_secrets s WHERE s.member_id = m.id);
