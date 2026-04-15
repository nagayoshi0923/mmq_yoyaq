-- scenario_characters テーブルへの公開読み取り権限を付与
-- anon/authenticated ロールが SELECT できるようにする（RLS は既存の USING (true) で制御）

GRANT SELECT ON public.scenario_characters TO anon;
GRANT SELECT ON public.scenario_characters TO authenticated;
