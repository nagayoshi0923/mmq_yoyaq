-- link_current_user_to_customer RPC に「同一 user_id の重複行」の統合を追加する (#382)。
--
-- 背景:
--   マイページ設定でニックネームを保存しても表示に反映されないケースがあった。原因の一つが
--   同じ user_id を持つ customers 行が複数存在する状態で、従来の RPC は未紐付け
--   (user_id IS NULL) の同一メール行しか統合しなかったため重複が残り続けていた。
--   重複があると .maybeSingle() が非決定的な行を返し、更新した行と表示に使う行が食い違う。
--
-- 本改修:
--   本人行（primary）を updated_at DESC / created_at ASC で決定したうえで、同じ user_id を持つ
--   他の行も primary へ統合（子テーブルの付け替え → 空プロフィール欄の補完 → 重複行の削除）する。
--   統合処理は未紐付け行の統合と完全に同一のため、両者を1つのループに統一した（挙動は従来と同じ）。
--
-- 安全性:
--   RLS ポリシーは変更しない。関数は従来どおり SECURITY DEFINER。照合キーは auth.users から
--   取得した本人の検証済みメールのみ。#341 の advisory lock も維持する。

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

  -- 既に本人の顧客行が紐付いている場合（冪等）。最後に更新された行を本人行(primary)とする (#382)
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE user_id = v_uid
  ORDER BY updated_at DESC NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    SELECT count(*) INTO v_match_count
    FROM public.customers
    WHERE user_id IS NULL
      AND lower(email) = v_email;

    -- 統合対象:
    --   1. 同じ user_id を持つ他の行（本人行の重複。件数に関わらず全て統合する #382）
    --   2. 同一メールの未紐付け行が「ちょうど1件」だけ残っている場合のその行
    --      （重複メール・複数組織ゲスト重複は曖昧とみなしスキップ）
    FOR v_dup_id IN
      SELECT d.id
      FROM (
        SELECT id, updated_at, created_at
        FROM public.customers
        WHERE user_id = v_uid
          AND id <> v_customer_id
        UNION ALL
        SELECT id, updated_at, created_at
        FROM public.customers
        WHERE v_match_count = 1
          AND user_id IS NULL
          AND lower(email) = v_email
      ) d
      ORDER BY d.updated_at DESC NULLS LAST, d.created_at ASC
    LOOP
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
      -- 上書きしない（本人行は最終更新が最も新しい行なので、本人が設定した値を優先）。
      -- ゲスト予約時に入力した氏名/ニックネーム等の保全のため (#334 / #288)
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
    END LOOP;

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
