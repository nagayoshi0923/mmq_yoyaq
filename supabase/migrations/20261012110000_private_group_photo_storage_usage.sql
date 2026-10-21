-- チャット写真の容量の見える化（社長決定 2026-10-11）。
-- 1. private_group_message_photos に byte_size（元画像＋小さい版の合計バイト数）を足す。
--    記録の追加時に Storage（private-group-photos）の実体の大きさから入れる（トリガー）。既にある分も入れる。
--    写真の削除は記録と実体を一緒に消すので、記録の合計＝いま Storage にある写真の大きさ。
-- 2. 管理画面用の集計 private_group_photo_storage_usage(): 自分の組織の総容量・今月（日本時間）の増加量・枚数と、
--    サイト全体の総容量（Storage の上限の目安 50GB を超えたら画面に注意を出すため）。スタッフ・管理者だけ。
BEGIN;

ALTER TABLE public.private_group_message_photos ADD COLUMN IF NOT EXISTS byte_size bigint;
COMMENT ON COLUMN public.private_group_message_photos.byte_size IS 'Storage 上の大きさ（元画像＋小さい版、バイト）。追加時にトリガーで storage.objects から入れる。管理画面の容量表示に使う';

CREATE OR REPLACE FUNCTION public.private_group_message_photo_set_size()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NEW.byte_size IS NULL THEN
  BEGIN
   SELECT coalesce(sum(nullif(o.metadata->>'size','')::bigint),0) INTO NEW.byte_size
     FROM storage.objects o
    WHERE o.bucket_id='private-group-photos' AND o.name IN (NEW.storage_path, NEW.thumb_path);
  EXCEPTION WHEN others THEN
   -- 大きさが読めなくても写真の送信は止めない
   NEW.byte_size := NULL;
  END;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_message_photo_set_size() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS private_group_message_photo_set_size ON public.private_group_message_photos;
CREATE TRIGGER private_group_message_photo_set_size BEFORE INSERT ON public.private_group_message_photos
 FOR EACH ROW EXECUTE FUNCTION public.private_group_message_photo_set_size();

-- 既にある写真の大きさ
UPDATE public.private_group_message_photos p
   SET byte_size = (SELECT coalesce(sum(nullif(o.metadata->>'size','')::bigint),0)
                      FROM storage.objects o
                     WHERE o.bucket_id='private-group-photos' AND o.name IN (p.storage_path, p.thumb_path))
 WHERE p.byte_size IS NULL;

CREATE OR REPLACE FUNCTION public.private_group_photo_storage_usage()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_month_start timestamptz; v_result jsonb;
BEGIN
 v_org := public.get_user_organization_id();
 IF v_org IS NULL OR NOT (coalesce(public.is_org_admin(),false) OR EXISTS(
   SELECT 1 FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=v_org AND s.status='active')) THEN
  RAISE EXCEPTION '写真の容量を表示する権限がありません' USING ERRCODE='42501';
 END IF;
 -- 今月の 1 日 0 時（日本時間）
 v_month_start := date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo';
 SELECT jsonb_build_object(
   'org_bytes', coalesce(sum(p.byte_size) FILTER (WHERE p.organization_id=v_org),0),
   'org_month_bytes', coalesce(sum(p.byte_size) FILTER (WHERE p.organization_id=v_org AND p.created_at>=v_month_start),0),
   'org_photo_count', count(*) FILTER (WHERE p.organization_id=v_org),
   'org_month_photo_count', count(*) FILTER (WHERE p.organization_id=v_org AND p.created_at>=v_month_start),
   'total_bytes', coalesce(sum(p.byte_size),0),
   'unknown_count', count(*) FILTER (WHERE p.organization_id=v_org AND p.byte_size IS NULL),
   'month_start', v_month_start,
   'warn_bytes', 53687091200::bigint)
   INTO v_result
   FROM public.private_group_message_photos p;
 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_photo_storage_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_group_photo_storage_usage() TO authenticated, service_role;
COMMENT ON FUNCTION public.private_group_photo_storage_usage() IS '管理画面（貸切グループ一覧）のチャット写真の容量: 自分の組織の総容量・今月の増加量・枚数、サイト全体の総容量と注意の目安（50GB）';

COMMIT;
