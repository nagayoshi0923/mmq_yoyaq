import { supabase } from '@/lib/supabase'

export interface AddPrivateGroupCandidatesInput {
  groupId: string
  requestId: string
  scenarioId: string
  storeIds: string[]
  candidates: Array<{ date: string; time_slot: string; start_time: string; end_time: string }>
}

export async function addPrivateGroupCandidates(input: AddPrivateGroupCandidatesInput): Promise<void> {
  const { data, error } = await supabase.rpc('private_group_add_candidate_dates', {
    p_group_id: input.groupId,
    p_request_id: input.requestId,
    p_expected_scenario_id: input.scenarioId,
    p_expected_store_ids: input.storeIds,
    p_candidates: input.candidates,
  })
  if (error) throw error
  if (!data || data.success !== true || !Array.isArray(data.candidate_ids) || data.candidate_ids.length !== input.candidates.length) {
    throw new Error('候補日の保存結果を確認できません。同じ候補のまま再度保存してください。')
  }
}
