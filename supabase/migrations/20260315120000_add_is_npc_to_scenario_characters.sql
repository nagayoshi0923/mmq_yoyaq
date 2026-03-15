-- scenario_charactersテーブルにis_npcカラムを追加
-- NPCキャラクターはプレイ人数にカウントしない

ALTER TABLE public.scenario_characters
ADD COLUMN IF NOT EXISTS is_npc BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.scenario_characters.is_npc IS 'NPCフラグ（trueの場合、プレイ人数にカウントしない）';
