-- 店舗名の表記を「クインズワルツ」に統一する（2026-10-06 社長指示。メールの署名・設定画面・事業者向けページ等すべて）。
-- データでは、メールの差出人名（email_settings.company_name）3 件と、運営設定の会社名（operating_setting_overrides.settings.company_name）8 件が
-- 「クイーンズワルツ」だった。値がちょうど「クイーンズワルツ」の行だけを直す（他の文字列には触れない）。送信済みメールの記録は直さない。
UPDATE public.email_settings
   SET company_name = 'クインズワルツ', updated_at = now()
 WHERE company_name = 'クイーンズワルツ';

UPDATE public.operating_setting_overrides
   SET settings = jsonb_set(settings, '{company_name}', to_jsonb('クインズワルツ'::text)),
       revision = revision + 1,
       updated_at = now()
 WHERE settings->>'company_name' = 'クイーンズワルツ';
