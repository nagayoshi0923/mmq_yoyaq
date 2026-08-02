-- 店舗代表アカウントをメールアドレスではなくユーザー属性で識別する。
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_store_representative BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_store_representative IS
  '店舗代表専用ダッシュボードへログイン後に遷移するアカウントかどうか';
