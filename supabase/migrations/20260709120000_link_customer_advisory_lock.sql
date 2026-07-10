-- link_current_user_to_customer RPC の重複統合ブロックを、同一メールの並行実行から保護する (#341)。
--
-- 背景:
--   #334 でこの RPC はマイページ読み込みのたびに（本人行が既に紐付いていても）呼ばれるように
--   なった。統合ブロック（v_customer_id IS NOT NULL の分岐）には行ロックが無いため、同一ユーザーが
--   複数タブ/デバイスから同時にマイページを開くと、両トランザクションが v_match_count = 1 を同時に
--   読み取り、片方が重複行を DELETE した後にもう片方が同じ行の UPDATE/DELETE を試みる競合が
--   理論上起こり得た（多くはデータ破損に至らないが、稀に制約絡みの想定外エラーの可能性）。
--
-- 本改修:
--   本人の検証済みメールをキーにトランザクションレベルの advisory lock を取得し、同一メールの
--   紐付け/統合処理を直列化する。異なるメール同士はロックが競合しないため通常負荷への影響は無い。
--   ロックはトランザクション終了時に自動解放される。
--
-- 安全性:
--   RLS ポリシーは変更しない。関数は従来どおり SECURITY DEFINER。照合キーは auth.users から
--   取得した本人の検証済みメールのみ。ロジックは #334 版と同一で、advisory lock の取得のみ追加。

CREATE OR REPLACE FUNCTION public.link_current_user_to_customer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_role        app_role;
  v_customer_id uuid;
  v_dup_id      uuid;
  v_match_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;  -- 未ログイン
  END IF;

  -- 本人の検証済みメールを auth.users から取得
  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- 同一メールの紐付け/統合処理を直列化（複数タブ/デバイスからの並行呼び出し対策 #341）。
  -- トランザクション終了時に自動解放される。異なるメールはロックが競合しない。
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  -- 呼び出しユーザー自身の role（staff/admin/license_admin が自分用の customer 行を
  -- 誤って組織から外さないためのガード。20260521030000 と同じ条件）
  SELECT role INTO v_role
  FROM public.users
  WHERE id = v_uid;

  -- 既に本人の顧客行が紐付いている場合（冪等）。同一メールの未紐付け重複行が「ちょうど1件」
  -- だけ残っていれば、その行の予約・プレイ履歴等を本人行へ統合してから重複行を削除する。
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE user_id = v_uid
  LIMIT 1;
  IF v_customer_id IS NOT NULL THEN
    SELECT count(*) INTO v_match_count
    FROM public.customers
    WHERE user_id IS NULL
      AND lower(email) = v_email;

    IF v_match_count = 1 THEN
      SELECT id INTO v_dup_id
      FROM public.customers
      WHERE user_id IS NULL
        AND lower(email) = v_email
      LIMIT 1;

      -- reservations（ON DELETE RESTRICT なので先に付け替え）
      UPDATE public.reservations SET customer_id = v_customer_id WHERE customer_id = v_dup_id;

      -- customer_org_stats（PK: customer_id, organization_id）
      INSERT INTO public.customer_org_stats (customer_id, organization_id, notes, visit_count, total_spent, last_visit)
      SELECT v_customer_id, organization_id, notes, visit_count, total_spent, last_visit
      FROM public.customer_org_stats
      WHERE customer_id = v_dup_id
      ON CONFLICT (customer_id, organization_id) DO NOTHING;

      -- scenario_likes (UNIQUE: customer_id, scenario_id)
      DELETE FROM public.scenario_likes
      WHERE customer_id = v_dup_id
        AND scenario_id IN (SELECT scenario_id FROM public.scenario_likes WHERE customer_id = v_customer_id);
      UPDATE public.scenario_likes SET customer_id = v_customer_id WHERE customer_id = v_dup_id;

      -- scenario_ratings (UNIQUE: customer_id, scenario_master_id)
      DELETE FROM public.scenario_ratings
      WHERE customer_id = v_dup_id
        AND scenario_master_id IN (SELECT scenario_master_id FROM public.scenario_ratings WHERE customer_id = v_customer_id);
      UPDATE public.scenario_ratings SET customer_id = v_customer_id WHERE customer_id = v_dup_id;

      -- customer_played_overrides (UNIQUE: customer_id, scenario_master_id)
      DELETE FROM public.customer_played_overrides
      WHERE customer_id = v_dup_id
        AND scenario_master_id IN (SELECT scenario_master_id FROM public.customer_played_overrides WHERE customer_id = v_customer_id);
      UPDATE public.customer_played_overrides SET customer_id = v_customer_id WHERE customer_id = v_dup_id;

      -- customer_memos (UNIQUE: customer_id, organization_id)
      DELETE FROM public.customer_memos
      WHERE customer_id = v_dup_id
        AND organization_id IN (SELECT organization_id FROM public.customer_memos WHERE customer_id = v_customer_id);
      UPDATE public.customer_memos SET customer_id = v_customer_id WHERE customer_id = v_dup_id;

      -- ユニーク制約の無い CASCADE テーブル
      UPDATE public.customer_coupons          SET customer_id = v_customer_id WHERE customer_id = v_dup_id;
      UPDATE public.manual_play_history        SET customer_id = v_customer_id WHERE customer_id = v_dup_id;
      UPDATE public.album_character_records    SET customer_id = v_customer_id WHERE customer_id = v_dup_id;
      UPDATE public.user_notifications         SET customer_id = v_customer_id WHERE customer_id = v_dup_id;
      UPDATE public.waitlist                   SET customer_id = v_customer_id WHERE customer_id = v_dup_id;

      -- 本人行の空プロフィール欄を、統合元(重複行)の値で補完する。本人行に既に値があれば
      -- 上書きしない（本人が設定した値を優先）。ゲスト予約時に入力した氏名/ニックネーム等の
      -- 保全のため (#334 / #288)
      UPDATE public.customers dst
      SET name       = COALESCE(NULLIF(btrim(dst.name), ''),     NULLIF(btrim(src.name), ''),     dst.name),
          nickname   = COALESCE(NULLIF(btrim(dst.nickname), ''), NULLIF(btrim(src.nickname), ''), dst.nickname),
          phone      = COALESCE(NULLIF(btrim(dst.phone), ''),    NULLIF(btrim(src.phone), ''),    dst.phone),
          address    = COALESCE(NULLIF(btrim(dst.address), ''),  NULLIF(btrim(src.address), ''),  dst.address),
          line_id    = COALESCE(NULLIF(btrim(dst.line_id), ''),  NULLIF(btrim(src.line_id), ''),  dst.line_id),
          avatar_url = COALESCE(NULLIF(btrim(dst.avatar_url), ''), NULLIF(btrim(src.avatar_url), ''), dst.avatar_url),
          updated_at = NOW()
      FROM public.customers src
      WHERE dst.id = v_customer_id
        AND src.id = v_dup_id;

      -- 統合済みの重複行を削除（残る customer_org_stats 等は CASCADE で削除される）
      DELETE FROM public.customers WHERE id = v_dup_id;
    END IF;

    RETURN v_customer_id;
  END IF;

  -- 未紐付けの候補が「ちょうど1件」のときのみ紐付ける（組織横断でグローバルにチェック。
  -- 重複メール・複数組織ゲスト重複は曖昧とみなしスキップ）
  SELECT count(*) INTO v_match_count
  FROM public.customers
  WHERE user_id IS NULL
    AND lower(email) = v_email;

  IF v_match_count = 1 THEN
    UPDATE public.customers
    SET user_id = v_uid,
        organization_id = CASE WHEN v_role = 'customer' THEN NULL ELSE organization_id END,
        updated_at = NOW()
    WHERE user_id IS NULL
      AND lower(email) = v_email
    RETURNING id INTO v_customer_id;
  END IF;

  RETURN v_customer_id;  -- 照合不能・曖昧なら NULL
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_current_user_to_customer() TO authenticated;
