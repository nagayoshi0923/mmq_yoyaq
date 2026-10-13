/** 配役の保存（チャットの配役カードと同じ RPC をそのまま使う） */
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'

/** 決め方を選ぶ・変える（null で選び直し）。変えると希望・配役・アンケートのキャラクターの回答はリセットされる */
export async function saveCastingMethod(groupId: string, next: 'survey' | 'self' | null, expectedMethod: string | null, expectedAssignments: Record<string, string>) {
  const { error } = await privateGroupRpcApi.setCharacterMethod({
    p_group_id: groupId, p_method: next, p_expected_method: expectedMethod, p_expected_assignments: expectedAssignments,
  })
  if (error) throw error
}

/** やりたいキャラクターを選ぶ（会員・ゲストとも本人の印で保存） */
export async function saveCharacterPreference(groupId: string, memberId: string, characterId: string) {
  const { error } = await privateGroupMemberAction(groupId, memberId, 'character_preference', { characterId })
  if (error) throw error
}

/** 配役を確定する（全員分・重なりなし。期待値が変わっていれば弾かれる） */
export async function saveCastingDecisions(groupId: string, assignments: Record<string, string>, expected: Record<string, string>) {
  const { error } = await privateGroupRpcApi.confirmCharacters({ p_group_id: groupId, p_assignments: assignments, p_expected_assignments: expected })
  if (error) throw error
}
