-- ============================================================
-- Staging ← Production スキーマ同期 SQL
-- 生成日: 2026-02-09
-- 目的: staging DB のスキーマを本番と完全一致させる
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 不足テーブルの作成
-- ============================================================

-- kit_transfer_completions（本番にあり staging にない）
CREATE TABLE IF NOT EXISTS "public"."kit_transfer_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "scenario_id" "uuid" NOT NULL,
    "kit_number" integer DEFAULT 1 NOT NULL,
    "performance_date" "date" NOT NULL,
    "from_store_id" "uuid" NOT NULL,
    "to_store_id" "uuid" NOT NULL,
    "picked_up_at" timestamp with time zone,
    "picked_up_by" "uuid",
    "delivered_at" timestamp with time zone,
    "delivered_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("id")
);

-- RLS を有効化
ALTER TABLE "public"."kit_transfer_completions" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. 不足カラムの追加（organizations）
-- ============================================================
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "cancel_policy_content" text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "cancel_policy_published" boolean DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "faq_content" text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS "faq_published" boolean DEFAULT false;

-- ============================================================
-- 3. 不足カラムの追加（scenario_kit_locations）
-- ============================================================
ALTER TABLE public.scenario_kit_locations ADD COLUMN IF NOT EXISTS "condition" text DEFAULT 'good';
ALTER TABLE public.scenario_kit_locations ADD COLUMN IF NOT EXISTS "condition_notes" text;

-- ============================================================
-- 4. 不足カラムの追加（stores）
-- ============================================================
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "fixed_costs" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "franchise_fee" integer DEFAULT 1000;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "kit_group_id" uuid;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "temporary_date" date;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "temporary_dates" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "temporary_venue_names" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS "transport_allowance" integer;

-- ============================================================
-- 5. 不足 Function の作成
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_kit_transfer_completions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ============================================================
-- 6. 不足 Trigger の作成
-- ============================================================
DROP TRIGGER IF EXISTS update_kit_transfer_completions_updated_at ON public.kit_transfer_completions;
CREATE TRIGGER update_kit_transfer_completions_updated_at
    BEFORE UPDATE ON public.kit_transfer_completions
    FOR EACH ROW EXECUTE FUNCTION public.update_kit_transfer_completions_updated_at();

-- NOTE: private-booking-notification トリガーは本番URLをハードコードしているため
-- staging には追加しない（staging 用の URL に差し替えが必要）

-- ============================================================
-- 完了確認
-- ============================================================
DO $$
DECLARE
    missing_count integer;
BEGIN
    -- kit_transfer_completions テーブルの存在確認
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kit_transfer_completions' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'kit_transfer_completions テーブルが作成されていません';
    END IF;

    -- 不足カラムの確認
    SELECT COUNT(*) INTO missing_count
    FROM (
        VALUES 
            ('organizations', 'cancel_policy_content'),
            ('organizations', 'cancel_policy_published'),
            ('organizations', 'faq_content'),
            ('organizations', 'faq_published'),
            ('scenario_kit_locations', 'condition'),
            ('scenario_kit_locations', 'condition_notes'),
            ('stores', 'fixed_costs'),
            ('stores', 'franchise_fee'),
            ('stores', 'kit_group_id'),
            ('stores', 'temporary_date'),
            ('stores', 'temporary_dates'),
            ('stores', 'temporary_venue_names'),
            ('stores', 'transport_allowance')
    ) AS expected(tbl, col)
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = expected.tbl
          AND c.column_name = expected.col
    );

    IF missing_count > 0 THEN
        RAISE EXCEPTION '% 個のカラムが不足しています', missing_count;
    END IF;

    RAISE NOTICE '✅ スキーマ同期完了: テーブル1個 + カラム13個を追加';
END;
$$;

COMMIT;
