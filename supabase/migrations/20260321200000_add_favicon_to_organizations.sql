-- organizationsテーブルにfavicon_urlカラムを追加
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS favicon_url TEXT;

COMMENT ON COLUMN public.organizations.favicon_url IS '組織のファビコンURL';

DO $$
BEGIN
  RAISE NOTICE '✅ favicon_url カラムを organizations テーブルに追加しました';
END $$;
