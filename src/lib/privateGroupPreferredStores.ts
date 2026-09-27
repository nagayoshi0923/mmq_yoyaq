import { supabase } from '@/lib/supabase'

export async function savePrivateGroupPreferredStores(groupId: string, storeIds: string[], expectedStoreIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('private_group_set_preferred_stores', {
    p_group_id: groupId,
    p_store_ids: storeIds,
    p_expected_store_ids: expectedStoreIds,
  })
  if (error) throw error
  if (!Number.isInteger(data) || data < 0) throw new Error('保存結果を確認できません')
  return data
}
