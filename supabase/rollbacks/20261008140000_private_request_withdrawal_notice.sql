-- 20261008140000 の取り消し: 申込中の貸切取り下げ通知の関数を削除する
DROP FUNCTION IF EXISTS public.enqueue_private_request_withdrawal(uuid);
