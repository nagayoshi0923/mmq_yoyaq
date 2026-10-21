/**
 * 配役と事前配役アンケートの状況（DB 関数 private_group_casting_status）。
 * 決め方・配役が確定済みか・アンケートの回答済み人数／対象人数・自分の回答の有無。
 * 未回答の人の名前は主催者が呼んだときだけ返る。回答の中身は返らない。
 */
import { supabase } from '@/lib/supabase'
import { getPrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'

export interface PrivateGroupCastingStatus {
  survey_enabled: boolean
  method?: 'survey' | 'self' | null
  /** 最後に決め方を選び直した後に配役が確定したか */
  casting_confirmed?: boolean
  is_organizer?: boolean
  /** 外部フォーム（回答状況が分からない） */
  external?: boolean
  question_count?: number
  deadline_at?: string | null
  target_count?: number
  answered_count?: number
  i_answered?: boolean
  /** 主催者のときだけ（メンバー・ゲストには null） */
  unanswered?: Array<{ member_id: string; name: string }> | null
}

export async function readPrivateGroupCastingStatus(groupId: string, memberId: string): Promise<PrivateGroupCastingStatus> {
  const { data, error } = await supabase.rpc('private_group_casting_status', {
    p_group_id: groupId,
    p_member_id: memberId,
    p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (error) throw error
  return (data ?? { survey_enabled: false }) as PrivateGroupCastingStatus
}

/** 回答状況を読み直すときのキー（グループ画面の箱・概要タブで共用） */
export const castingStatusKey = (groupId: string, memberId: string) => ['group-casting-status', groupId, memberId] as const
