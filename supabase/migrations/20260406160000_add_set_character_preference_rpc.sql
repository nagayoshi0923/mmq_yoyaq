-- アトミックにキャラクター希望を1つだけ更新するRPC
-- 複数ユーザーが同時に保存しても上書きが発生しない
CREATE OR REPLACE FUNCTION set_character_preference(
  p_group_id UUID,
  p_member_id TEXT,
  p_character_id TEXT
) RETURNS void AS $$
BEGIN
  UPDATE private_groups
  SET character_assignments = coalesce(character_assignments, '{}'::jsonb) || jsonb_build_object(p_member_id, p_character_id)
  WHERE id = p_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_character_preference(UUID, TEXT, TEXT) TO anon, authenticated;
