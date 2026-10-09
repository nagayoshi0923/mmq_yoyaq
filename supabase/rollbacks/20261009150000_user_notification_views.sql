-- 20261009150000 の取り消し: 通知ベルを最後に開いた時刻の表を外す
-- 注意: 各利用者の「最後に開いた時刻」が消える。画面は時刻が無い人として未読件数を出す（従来の数字）
BEGIN;
DROP TABLE IF EXISTS public.user_notification_views;
COMMIT;
