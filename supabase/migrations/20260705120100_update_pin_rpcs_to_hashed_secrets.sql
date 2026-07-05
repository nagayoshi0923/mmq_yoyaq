-- #281 / #283: PIN の保存・認証 RPC を secrets テーブル（bcryptハッシュ）ベースに差し替える。
-- シグネチャは既存のまま維持するため、アプリ側のコード変更は不要。

-- ============================================================
-- 1) save_guest_access_pin: 平文保存 → secrets への bcrypt ハッシュ保存
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_guest_access_pin(
  p_member_id UUID,
  p_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member RECORD;
BEGIN
  SELECT * INTO v_member
  FROM public.private_group_members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- ゲストユーザー（user_id が NULL）のみ PIN 設定可能
  IF v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only guest members can have PIN';
  END IF;

  -- secrets に bcrypt ハッシュで upsert
  INSERT INTO public.private_group_member_secrets (member_id, access_pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_member_id, crypt(p_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (member_id)
  DO UPDATE SET access_pin_hash = EXCLUDED.access_pin_hash,
                failed_attempts = 0,
                locked_until    = NULL,
                updated_at      = now();

  -- 平文カラムには保存しない（露出防止）。移行期間中の後方互換のため列自体は残すが NULL 化する。
  UPDATE public.private_group_members
  SET access_pin = NULL
  WHERE id = p_member_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.save_guest_access_pin IS
  'ゲストPINをsecretsテーブルにbcryptハッシュで保存する（#281/#283）';

GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO anon;
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO authenticated;

-- ============================================================
-- 2) authenticate_guest_by_pin: 平文照合 → secrets のハッシュ照合
--    後方互換: secrets が無いメンバーは旧 access_pin(平文) で照合し、
--    成功時に secrets へ自動移行してから平文を NULL 化する（段階移行のフォールバック）。
--    OUTパラメータ名(member_id 等)とテーブル列名の衝突を避けるため #variable_conflict use_column を指定。
-- ============================================================
DROP FUNCTION IF EXISTS public.authenticate_guest_by_pin(uuid, text, text);

CREATE FUNCTION public.authenticate_guest_by_pin(
  p_group_id UUID,
  p_email TEXT,
  p_pin TEXT
)
RETURNS TABLE (
  member_id UUID,
  guest_name TEXT,
  guest_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
#variable_conflict use_column
DECLARE
  v_member RECORD;
  v_hash TEXT;
  v_ok BOOLEAN := FALSE;
BEGIN
  SELECT pgm.id, pgm.guest_name, pgm.guest_email, pgm.access_pin
  INTO v_member
  FROM public.private_group_members pgm
  WHERE pgm.group_id = p_group_id
    AND LOWER(pgm.guest_email) = LOWER(p_email)
    AND pgm.status = 'joined'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT s.access_pin_hash INTO v_hash
  FROM public.private_group_member_secrets s
  WHERE s.member_id = v_member.id;

  IF v_hash IS NOT NULL THEN
    -- 通常経路: bcrypt ハッシュ照合
    IF v_hash = crypt(p_pin, v_hash) THEN
      v_ok := TRUE;
    END IF;
  ELSIF v_member.access_pin IS NOT NULL THEN
    -- フォールバック: 旧平文で照合し、成功したら secrets へ移行して平文を NULL 化
    IF v_member.access_pin = p_pin THEN
      v_ok := TRUE;
      INSERT INTO public.private_group_member_secrets (member_id, access_pin_hash, updated_at)
      VALUES (v_member.id, crypt(p_pin, gen_salt('bf')), now())
      ON CONFLICT (member_id) DO NOTHING;
      UPDATE public.private_group_members SET access_pin = NULL WHERE id = v_member.id;
    END IF;
  END IF;

  IF v_ok THEN
    member_id   := v_member.id;
    guest_name  := v_member.guest_name;
    guest_email := v_member.guest_email;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.authenticate_guest_by_pin IS
  'ゲストPIN認証。secretsのbcryptハッシュ照合＋旧平文フォールバック自動移行（#281/#283）';

GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO authenticated;
