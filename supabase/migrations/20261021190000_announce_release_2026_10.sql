-- お知らせ「予約サイトが新しくなりました」（2026-10 リリースの告知）をサイト内通知（ベル）に積む関数（2026-10-21）。
-- 前例: announce_mypage_update_2026_10()（20261009140000）。今回は対象を 2 案から選べるようにし、既定は「件数を数えるだけ」。
--   p_mode = 'private_group_participants'（既定）: 貸切グループの主催者またはメンバーだったことがある会員（前例と同じ対象）
--   p_mode = 'all_members'                        : ログインできる会員全員（customers.user_id あり）。組織は直近の予約の組織、無ければ NULL
--   p_dry_run = true（既定）: 何も書かず、対象件数・すでに積んだ件数・組織別の件数・文面を返す
--   p_dry_run = false       : user_notifications に type='system'、metadata.kind='release_note' で積む。
--                             dedupe_key（release_note:release-2026-10:<user_id>）と既存の部分ユニーク index で 1 人 1 件。何度呼んでも増えない
-- metadata.kind='release_note' はウェブプッシュ（web_push_on_user_notification）・メール（customer_notice_on_handover_bell）の対象外。ベルに出るだけ。
-- 呼べるのは service_role だけ（ブラウザの役割からは呼べない）。
-- 戻し方: supabase/rollbacks/20261021190000_announce_release_2026_10.sql（関数を消す。積んだ通知は残る）。
BEGIN;

CREATE OR REPLACE FUNCTION public.announce_release_2026_10(p_mode text DEFAULT 'private_group_participants', p_dry_run boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
 -- 文面（変えるときはここだけ直す。絵文字は使わない）
 c_key     constant text := 'release-2026-10';
 c_title   constant text := '予約サイトが新しくなりました';
 c_message constant text := '貸切グループのチャットで写真が共有できるようになり、貸切の申込が分かりやすくなりました。クーポンは来店時に「もぎる」で提示できます。詳しくはこのお知らせを開いてご覧ください。';
 c_link    constant text := '/mypage?tab=reservations&sub=private';
 c_details constant jsonb := jsonb_build_array(
  '貸切グループのチャットで写真を共有できるようになりました（1 グループ 10 枚まで）。既読の表示、返信やリアクションも使えます。',
  '「貸切を始める」ページから、店舗と作品を選んで貸切の申込を始められます。申込の流れは貸切ガイドで確認できます。',
  '貸切の申込で、候補日に優先順を付けて送れるようになりました。希望する店舗の一部だけに送ることもできます。',
  '申込を取り下げるときに、グループを残すかどうかを選べます。マイページの予約詳細からも取り下げられます。',
  '貸切で選べる時間帯は店舗ごとの受付時間どおりに表示されます。何日先まで申し込めるかも案内しています。',
  'トップページの「空いている公演を探す」で今月の公演とすべての公演を切り替えられます。残りわずかの公演も分かりやすくなりました。',
  'クーポンは来店時に「もぎる（来店確認）」で提示できます。予約時に付けたクーポンも同じです。公演当日だけ使えるクーポンは「この予約に使う」から使えます。',
  'マイページの予約詳細に、取消の期限と当日のお支払いの案内を出しました。公演の後は、グループの「思い出」ページで感想を書けます。'
 );
 v_users uuid[]; v_orgs uuid[]; v_by_org jsonb; v_total integer; v_already integer; v_inserted integer := 0;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN ('all_members','private_group_participants') THEN
  RAISE EXCEPTION 'announce_release_2026_10: p_mode は all_members か private_group_participants（指定: %）', coalesce(p_mode,'NULL') USING ERRCODE='22023';
 END IF;
 IF p_dry_run IS NULL THEN
  RAISE EXCEPTION 'announce_release_2026_10: p_dry_run を true か false で指定してください' USING ERRCODE='22023';
 END IF;

 -- 対象（1 人 1 行、組織は 1 つ）を配列に集める
 IF p_mode = 'all_members' THEN
  -- ログインできる会員全員（customers.user_id あり）。組織は直近の予約の組織、予約が無ければ NULL
  SELECT coalesce(array_agg(t.user_id ORDER BY t.user_id),'{}'), coalesce(array_agg(t.organization_id ORDER BY t.user_id),'{}')
    INTO v_users, v_orgs
    FROM (SELECT u.user_id,
                 (SELECT r.organization_id FROM public.reservations r JOIN public.customers c2 ON c2.id=r.customer_id
                   WHERE c2.user_id=u.user_id ORDER BY r.created_at DESC NULLS LAST, r.id LIMIT 1) AS organization_id
            FROM (SELECT DISTINCT c.user_id FROM public.customers c WHERE c.user_id IS NOT NULL) u
            JOIN auth.users au ON au.id=u.user_id) t;
 ELSE
  -- 貸切グループの主催者またはメンバーだったことがある会員（announce_mypage_update_2026_10 と同じ）。組織は関わったグループのうち最近のもの
  SELECT coalesce(array_agg(t.user_id ORDER BY t.user_id),'{}'), coalesce(array_agg(t.organization_id ORDER BY t.user_id),'{}')
    INTO v_users, v_orgs
    FROM (SELECT DISTINCT ON (x.user_id) x.user_id, x.organization_id
            FROM (SELECT g.organizer_id AS user_id, g.organization_id, g.created_at FROM public.private_groups g
                  UNION ALL
                  SELECT m.user_id, g.organization_id, coalesce(m.joined_at,m.created_at) FROM public.private_group_members m
                    JOIN public.private_groups g ON g.id=m.group_id WHERE m.user_id IS NOT NULL) x
            JOIN auth.users au ON au.id=x.user_id
           ORDER BY x.user_id, x.created_at DESC) t;
 END IF;

 v_total := cardinality(v_users);
 SELECT count(*) INTO v_already FROM unnest(v_users) AS t(user_id)
  WHERE EXISTS(SELECT 1 FROM public.user_notifications n WHERE n.metadata ? 'dedupe_key'
                 AND n.metadata->>'dedupe_key'='release_note:'||c_key||':'||t.user_id::text);
 SELECT coalesce(jsonb_agg(jsonb_build_object('organization_id',s.organization_id,'organization_name',s.name,'count',s.n)
          ORDER BY s.n DESC, s.name NULLS LAST),'[]'::jsonb)
   INTO v_by_org
   FROM (SELECT t.organization_id, o.name, count(*)::int AS n FROM unnest(v_users, v_orgs) AS t(user_id, organization_id)
          LEFT JOIN public.organizations o ON o.id=t.organization_id GROUP BY t.organization_id, o.name) s;

 IF NOT p_dry_run THEN
  WITH ins AS (
   INSERT INTO public.user_notifications(user_id,organization_id,type,title,message,link,metadata)
   SELECT t.user_id,t.organization_id,'system',c_title,c_message,c_link,
    jsonb_build_object('kind','release_note','key',c_key,'dedupe_key','release_note:'||c_key||':'||t.user_id::text,'details',c_details)
   FROM unnest(v_users, v_orgs) AS t(user_id, organization_id)
   ON CONFLICT ((metadata->>'dedupe_key')) WHERE (metadata ? 'dedupe_key') DO NOTHING
   RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;
 END IF;

 RETURN jsonb_build_object(
  'mode', p_mode, 'dry_run', p_dry_run, 'key', c_key,
  'target_count', v_total, 'already_notified', v_already,
  'would_insert', v_total - v_already, 'inserted', v_inserted,
  'by_organization', v_by_org,
  'title', c_title, 'message', c_message, 'link', c_link, 'details', c_details);
END $function$;
REVOKE ALL ON FUNCTION public.announce_release_2026_10(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.announce_release_2026_10(text, boolean) TO service_role;

COMMIT;
