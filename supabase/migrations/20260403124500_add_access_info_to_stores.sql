-- stores に店舗アクセス情報カラムを追加
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS access_info text;
