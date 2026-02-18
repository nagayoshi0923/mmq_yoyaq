-- 支払い方法の設定カラムを reservation_settings に追加
-- デフォルト値は「現地決済」

ALTER TABLE public.reservation_settings
ADD COLUMN IF NOT EXISTS payment_method_label TEXT DEFAULT '現地決済';

ALTER TABLE public.reservation_settings
ADD COLUMN IF NOT EXISTS payment_method_description TEXT DEFAULT 'ご来店時にお支払いください';
