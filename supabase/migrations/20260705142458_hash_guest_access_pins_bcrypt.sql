-- #283: pii.access_pin の bcrypt ハッシュ化（staging検証済み構成と同一）

-- 1) 列追加（#282 レート制限の土台列も同時に用意。ロジックは #282 で別途）
ALTER TABLE public.private_group_members_pii
  ADD COLUMN IF NOT EXISTS access_pin_hash text,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 2) 保存経路をハッシュ化版に差し替え（以後、平文は一切書き込まれない）
CREATE OR REPLACE FUNCTION public.save_guest_access_pin(p_member_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_member RECORD;
BEGIN
  SELECT * INTO v_member
  FROM public.private_group_members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only guest members can have PIN';
  END IF;

  INSERT INTO public.private_group_members_pii (member_id, access_pin_hash, access_pin, failed_attempts, locked_until, updated_at)
  VALUES (p_member_id, extensions.crypt(p_pin, extensions.gen_salt('bf')), NULL, 0, NULL, now())
  ON CONFLICT (member_id) DO UPDATE SET
    access_pin_hash = EXCLUDED.access_pin_hash,
    access_pin = NULL,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = now();

  RETURN TRUE;
END;
$function$;

-- 3) 認証経路をハッシュ照合＋平文フォールバック（自動移行）版に差し替え
--    フォールバック内 UPDATE は pii2 で修飾（RETURNS TABLE の member_id と衝突するため）
CREATE OR REPLACE FUNCTION public.authenticate_guest_by_pin(p_group_id uuid, p_email text, p_pin text)
RETURNS TABLE(member_id uuid, guest_name text, guest_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_member_id uuid;
  v_name text;
  v_email text;
  v_hash text;
  v_plain text;
  v_ok boolean := false;
BEGIN
  SELECT pgm.id, pii.guest_name, pii.guest_email, pii.access_pin_hash, pii.access_pin
  INTO v_member_id, v_name, v_email, v_hash, v_plain
  FROM public.private_group_members pgm
  JOIN public.private_group_members_pii pii ON pii.member_id = pgm.id
  WHERE pgm.group_id = p_group_id
    AND LOWER(pii.guest_email) = LOWER(p_email)
    AND pgm.status = 'joined'
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN;
  END IF;

  IF v_hash IS NOT NULL THEN
    IF v_hash = extensions.crypt(p_pin, v_hash) THEN
      v_ok := true;
    END IF;
  ELSIF v_plain IS NOT NULL THEN
    IF v_plain = p_pin THEN
      v_ok := true;
      UPDATE public.private_group_members_pii pii2
      SET access_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
          access_pin = NULL,
          updated_at = now()
      WHERE pii2.member_id = v_member_id;
    END IF;
  END IF;

  IF v_ok THEN
    member_id := v_member_id;
    guest_name := v_name;
    guest_email := v_email;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$function$;

-- 4) 既存平文のバックフィル（3段階・安全弁付き）
-- 4-1) 平文からハッシュを生成（この時点では平文を残す）
UPDATE public.private_group_members_pii
SET access_pin_hash = extensions.crypt(access_pin, extensions.gen_salt('bf')),
    updated_at = now()
WHERE access_pin IS NOT NULL
  AND access_pin_hash IS NULL;

-- 4-2) 安全弁: 全件をハッシュ照合で検証。1件でも不一致なら例外 → 全ロールバック
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.private_group_members_pii
  WHERE access_pin IS NOT NULL
    AND (access_pin_hash IS NULL
         OR access_pin_hash <> extensions.crypt(access_pin, access_pin_hash));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'PIN hash verification failed for % rows - aborting migration (full rollback)', v_bad;
  END IF;
END $$;

-- 4-3) 照合一致が確認できた行のみ平文を破棄
UPDATE public.private_group_members_pii
SET access_pin = NULL,
    updated_at = now()
WHERE access_pin IS NOT NULL
  AND access_pin_hash = extensions.crypt(access_pin, access_pin_hash);